import {
  BuscarOcupacionDto,
  OcupacionSugerencia,
} from '../../../common/dto/buscar-ocupacion.dto';
import {
  ConsultarCuocOcupacionesDto,
  CuocOcupacionResultado,
  OrdenConsultaCuoc,
} from '../dto/consultar-cuoc-ocupaciones.dto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Raw } from 'typeorm';
import {
  CuocOcupacion,
  CuocFuncion,
  CuocDenominacion,
  CuocAreaCualificacion,
  CuocRegConocimiento,
  CuocDestreza,
  CuocGrupoPrimario,
  CuocNivelCompetencia,
  CuocConocimiento,
} from '../entities';
import { HabilidadDestreza } from '../../shared/entities';
import { CreateCuocOcupacionDto, UpdateCuocOcupacionDto } from '../dto';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { condicionTexto, ordenRelevancia, prefijoCodigo } from '../../../common/utils/busqueda-texto.util';

@Injectable()
export class CuocOcupacionService {
  private readonly RELATIONS = [
    'grupoPrimario',
    'nivelCompetencia',
    'areaCualificacion',
    'denominaciones',
    'funciones',
    'regConocimientos',
    'regConocimientos.conocimiento',
    'destrezas',
    'destrezas.habilidadDestreza',
    'ocupacionesAfines',
  ];

  constructor(
    @InjectRepository(CuocOcupacion)
    private readonly ocupacionRepo: Repository<CuocOcupacion>,

    @InjectRepository(CuocFuncion)
    private readonly funcionRepo: Repository<CuocFuncion>,

    @InjectRepository(CuocDenominacion)
    private readonly denominacionRepo: Repository<CuocDenominacion>,

    @InjectRepository(CuocRegConocimiento)
    private readonly regConocimientoRepo: Repository<CuocRegConocimiento>,

    @InjectRepository(CuocDestreza)
    private readonly destrezaRepo: Repository<CuocDestreza>,

    private readonly dataSource: DataSource,
  ) {}

/**
 * Solo las ocupaciones del catalogo oficial son consultables.
 *
 * Analisis genera copias editables cuyo codigo lleva un sufijo derivado
 * (`${codigo}-${comparativa}-${indice}`, ver OcupacionCopiaService), y esas copias
 * viven en la MISMA tabla que las originales para que Instrumento 2 pueda editarlas
 * sin tocar el catalogo real. El efecto colateral es que aparecian en los listados y
 * en el buscador como si fueran ocupaciones mas.
 *
 * Un codigo oficial es exactamente 5 digitos, sin excepciones (verificado contra
 * los 682 registros de la tabla), asi que ese patron separa el catalogo de las
 * copias sin depender de como se construya el sufijo.
 *
 * El patron por si solo deja pasar dos codigos que no son ocupaciones reales
 * del catalogo oficial (cPerfiles_Ocupacionales_CUOC_2025.xlsx, 680
 * ocupaciones), e inflaban en 2 el total que se muestra en Inicio (682 en vez
 * de 680):
 *   - '00000' ("Sin Clasificacion en CUOC 2023"): fila placeholder.
 *   - '26590' ("Artistas creativos..."): no esta en el Excel oficial vigente.
 * Se excluyen aparte.
 *
 * `findOne` NO aplica este filtro a proposito: Instrumento 2 y el detalle de una
 * copia necesitan poder resolverla por codigo exacto.
 */
  private static readonly SOLO_CATALOGO_OFICIAL = "^[0-9]{5}$";
  private static readonly CODIGOS_EXCLUIDOS = ['00000', '26590'];

  async findAll(pagination: PaginationDto): Promise<PageResponse<CuocOcupacion>> {
    try {
      // `denominaciones` es OneToMany: si se carga con `relations` en el mismo
      // `find`, TypeORM la trae con un LEFT JOIN y duplica cada ocupación por
      // cada una de sus denominaciones. Se pagina solo sobre `cuoc_ocupacion`
      // (con las relaciones ManyToOne, que no multiplican filas) y las
      // denominaciones de la página se traen aparte con un IN.
      const [resultado, total] = await this.ocupacionRepo.findAndCount({
        where: {
          codOcupacionCuoc: Raw((alias) => `${alias} ~ :patron AND ${alias} <> ALL(:excluidos)`, {
            patron: CuocOcupacionService.SOLO_CATALOGO_OFICIAL,
            excluidos: CuocOcupacionService.CODIGOS_EXCLUIDOS,
          }),
        },
        order: { codOcupacionCuoc: 'ASC' },
        relations: ['nivelCompetencia', 'areaCualificacion'],
        skip: pagination.skip,
        take: pagination.limit,
      });

      const codigos = resultado.map((o) => o.codOcupacionCuoc);
      const denominaciones = codigos.length
        ? await this.denominacionRepo.find({
            where: { ocupacion: { codOcupacionCuoc: In(codigos) } },
            relations: ['ocupacion'],
          })
        : [];

      const denomMap = new Map<string, CuocDenominacion[]>();
      for (const denom of denominaciones) {
        const cod = denom.ocupacion?.codOcupacionCuoc;
        delete denom.ocupacion;
        if (!cod) continue;
        if (!denomMap.has(cod)) denomMap.set(cod, []);
        denomMap.get(cod)!.push(denom);
      }
      for (const ocupacion of resultado) {
        ocupacion.denominaciones = denomMap.get(ocupacion.codOcupacionCuoc) ?? [];
      }

      return buildPageResponse(resultado, total, pagination);
    } catch (error) {
      console.error('ERROR EN findAll CUOC:', error);
      throw error;
    }
  }

  /**
   * Sugerencias para el autocompletado: sólo código y nombre, sin relaciones.
   * Evita que la vista tenga que descargar el catálogo completo al entrar.
   */
  async buscar(
    { q, limit }: BuscarOcupacionDto,
    { porDenominacion = false }: { porDenominacion?: boolean } = {},
  ): Promise<OcupacionSugerencia[]> {
    const termino = (q ?? '').trim();
    if (!termino) {
      return [];
    }

    const nombre = condicionTexto(['o.nom_ocupacion_cuoc'], termino)!;
    const relevancia = ordenRelevancia('o.cod_ocupacion_cuoc', 'o.nom_ocupacion_cuoc', termino)!;
    const denom = porDenominacion ? condicionTexto(['d.nom_denominacion'], termino) : null;
    const porDenom = denom
      ? ` OR EXISTS (SELECT 1 FROM cuoc_denominacion d
            WHERE d.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc AND d.estado = 1 AND ${denom.sql})`
      : '';

    const rows = await this.ocupacionRepo
      .createQueryBuilder('o')
      .select(['o.codOcupacionCuoc', 'o.nomOcupacionCuoc'])
      // Igual que en CNO: leftJoin para no perder ocupaciones sin area.
      .leftJoin('o.areaCualificacion', 'area')
      .addSelect(['area.codigo', 'area.descripcion'])
      // Agrupados en un solo where: sin el parentesis, el andWhere siguiente solo
      // afectaria a la condicion del nombre.
      .where(
        `(o.cod_ocupacion_cuoc ILIKE :prefijo OR ${nombre.sql}${porDenom})`,
        { prefijo: prefijoCodigo(termino), ...nombre.params },
      )
      .andWhere('o.cod_ocupacion_cuoc ~ :patron AND o.cod_ocupacion_cuoc <> ALL(:excluidos)', {
        patron: CuocOcupacionService.SOLO_CATALOGO_OFICIAL,
        excluidos: CuocOcupacionService.CODIGOS_EXCLUIDOS,
      })
      .addSelect(relevancia.sql, 'relevancia')
      .setParameters(relevancia.params)
      .orderBy('relevancia', 'ASC')
      .addOrderBy('o.cod_ocupacion_cuoc', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((o) => ({
      codigo: o.codOcupacionCuoc,
      nombre: o.nomOcupacionCuoc ?? '',
      area: o.areaCualificacion?.descripcion ?? undefined,
    }));
  }

  async findOne(cod: string): Promise<CuocOcupacion> {
    try {
      const ocupacion = await this.ocupacionRepo.findOne({
        where: { codOcupacionCuoc: cod },
        relations: ['grupoPrimario', 'nivelCompetencia', 'areaCualificacion'],
      });

      if (!ocupacion) {
        throw new NotFoundException(`Ocupación CUOC con código ${cod} no encontrada`);
      }

      const [denominaciones, funciones, regConocimientos, destrezas, afines] =
        await Promise.all([
          this.dataSource.query(
            `SELECT cod_denominacion as "codDenominacion", cod_denominacion as "codigo", nom_denominacion as "nombre", estado as "estado", fecha_registro as "fechaRegistro" FROM clasificacion.cuoc_denominacion WHERE cod_ocupacion_cuoc = $1 ORDER BY cod_denominacion`,
            [cod]
          ),
          this.dataSource.query(
            `SELECT cod_funcion_cuoc as "codigo", nom_funcion_cuoc as "descripcion", estado as "estado" FROM clasificacion.cuoc_funciones WHERE cod_ocupacion_cuoc = $1
             ORDER BY CASE WHEN cod_funcion_cuoc ~ '^[0-9]+$' THEN cod_funcion_cuoc::int END NULLS LAST, codigo`,
            [cod]
          ),
          this.dataSource.query(
            // `codigo` es el cod_conocimiento del catálogo, no la PK de
            // cuoc_reg_conocimientos: al guardar, la edición resuelve el
            // conocimiento por ese código, y con la PK del registro apuntaba
            // a otro conocimiento.
            `SELECT r.cod_conocimiento as "codigo", COALESCE(c.nomb_conocimiento, r.nomb_conocimiento, '') as "nombre" FROM clasificacion.cuoc_reg_conocimientos r LEFT JOIN clasificacion.cuoc_conocimiento c ON r.cod_conocimiento = c.cod_conocimiento WHERE r.cod_ocupacion_cuoc = $1 ORDER BY r.cod_conocimiento`,
            [cod]
          ),
          this.dataSource.query(
            // Igual que conocimientos: el código es el de habilidad_destreza
            // (codigo_destreza), no la PK del registro en cuoc_destreza.
            `SELECT d.codigo_destreza as "codigo", COALESCE(h.nomb_hab_dest, d.nomb_hab_dest, '') as "nombre" FROM clasificacion.cuoc_destreza d LEFT JOIN clasificacion.habilidad_destreza h ON d.codigo_destreza = h.cod_hab_dest WHERE d.cod_ocupacion_cuoc = $1 ORDER BY d.codigo_destreza`,
            [cod]
          ),
          this.dataSource.query(
            `SELECT codigo_ocupacion as "codigo", nombre_cno_afin as "nombre" FROM clasificacion.cuoc_ocupacion_afin WHERE cod_ocupacion_cuoc = $1`,
            [cod]
          ).catch(() => []),
        ]);

      ocupacion.denominaciones = denominaciones;
      ocupacion.funciones = funciones;
      (ocupacion as any).conocimientos = regConocimientos;
      (ocupacion as any).habilidades = destrezas;
      ocupacion.ocupacionesAfines = afines as any;

      return ocupacion;
    } catch (error) {
      console.error('ERROR EN findOne CUOC:', error);
      throw error;
    }
  }

  async create(dto: CreateCuocOcupacionDto): Promise<CuocOcupacion> {
    // Comparación de fechas ISO (YYYY-MM-DD) como texto; hoy en hora de Colombia.
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    if (dto.fechaRegistro && dto.fechaRegistro.slice(0, 10) > hoy) {
      throw new BadRequestException('La fecha de registro no puede ser posterior a hoy.');
    }

    const exists = await this.ocupacionRepo.findOne({
      where: { codOcupacionCuoc: dto.codOcupacionCuoc },
    });
    if (exists) {
      throw new ConflictException(
        `Ya existe una ocupación CUOC con código ${dto.codOcupacionCuoc}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const ocupacion = queryRunner.manager.create(CuocOcupacion, {
        codOcupacionCuoc: dto.codOcupacionCuoc,
        nomOcupacionCuoc: dto.nomOcupacionCuoc,
        descOcupacionCuoc: dto.descOcupacionCuoc,
        fechaRegistro: dto.fechaRegistro ? new Date(dto.fechaRegistro) : undefined,
        estado: dto.estado ?? false,
        fechaInactivacion: dto.fechaInactivacion ? new Date(dto.fechaInactivacion) : undefined,
        trazabilidad: dto.trazabilidad,
        grupoPrimario: dto.codGrupoPrim
          ? ({ codGrupoPrim: dto.codGrupoPrim } as CuocGrupoPrimario)
          : undefined,
        nivelCompetencia: dto.codNivel
          ? ({ codNivel: dto.codNivel } as CuocNivelCompetencia)
          : undefined,
        areaCualificacion: dto.codigoAreaCuoc
          ? ({ codigo: dto.codigoAreaCuoc } as CuocAreaCualificacion)
          : undefined,
      });

      if (dto.codNivel) {
        const nivel = await queryRunner.manager.findOne(CuocNivelCompetencia, {
          where: { codNivel: dto.codNivel },
        });
        if (nivel) ocupacion.nombreNivel = nivel.nombreNivel;
      }
      if (dto.codigoAreaCuoc) {
        const area = await queryRunner.manager.findOne(CuocAreaCualificacion, {
          where: { codigo: dto.codigoAreaCuoc },
        });
        if (area) ocupacion.nombre = area.descripcion;
      }

      await queryRunner.manager.save(CuocOcupacion, ocupacion);

      if (dto.funciones?.length) {
        const funciones = dto.funciones.map((f) =>
          queryRunner.manager.create(CuocFuncion, {
            codFuncionCuoc: f.codFuncionCuoc,
            nomFuncionCuoc: f.nomFuncionCuoc,
            ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
          }),
        );
        await queryRunner.manager.save(CuocFuncion, funciones);
      }

      if (dto.denominaciones?.length) {
        const denoms = dto.denominaciones.map((d) =>
          queryRunner.manager.create(CuocDenominacion, {
            codDenominacion: d.codDenominacion,
            nomDenominacion: d.nomDenominacion,
            fuenteDenom: d.fuenteDenom,
            observacion: d.observacion,
            ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
          }),
        );
        await queryRunner.manager.save(CuocDenominacion, denoms);
      }

      if (dto.regConocimientos?.length) {
        const concCodes = dto.regConocimientos.map((r) => r.codConocimiento);
        const concEntities = await queryRunner.manager.find(CuocConocimiento, {
          where: { codConocimiento: In(concCodes) },
        });
        const concMap = new Map(concEntities.map((c) => [c.codConocimiento, c.nombConocimiento]));

        const conocimientos = dto.regConocimientos.map((r) =>
          queryRunner.manager.create(CuocRegConocimiento, {
            ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
            conocimiento: { codConocimiento: r.codConocimiento } as CuocConocimiento,
            nombConocimiento: concMap.get(r.codConocimiento) ?? null,
          }),
        );
        await queryRunner.manager.save(CuocRegConocimiento, conocimientos);
      }

      if (dto.destrezas?.length) {
        const habCodes = dto.destrezas.map((d) => d.codHabDest);
        const habEntities = await queryRunner.manager.find(HabilidadDestreza, {
          where: { codHabDest: In(habCodes) },
        });
        const habMap = new Map(habEntities.map((h) => [h.codHabDest, h.nombHabDest]));

        const destrezas = dto.destrezas.map((d) =>
          queryRunner.manager.create(CuocDestreza, {
            ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
            habilidadDestreza: { codHabDest: d.codHabDest } as HabilidadDestreza,
            nombHabDest: habMap.get(d.codHabDest) ?? null,
          }),
        );
        await queryRunner.manager.save(CuocDestreza, destrezas);
      }

      await queryRunner.commitTransaction();
      return this.findOne(dto.codOcupacionCuoc);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    cod: string,
    dto: UpdateCuocOcupacionDto,
  ): Promise<CuocOcupacion> {
    // OJO: no usar this.findOne(cod) aquí. Esa función pisa
    // denominaciones/funciones/conocimientos/habilidades con objetos planos
    // {codigo, nombre} de una consulta SQL cruda (para la vista de detalle);
    // pasar ese objeto "contaminado" a manager.save() rompía con 500 porque
    // esos campos ya no tienen la forma de las entidades reales. Aquí se
    // necesita la entidad limpia tal cual la deja el repositorio.
    const ocupacion = await this.ocupacionRepo.findOne({ where: { codOcupacionCuoc: cod } });
    if (!ocupacion) {
      throw new NotFoundException(`Ocupación CUOC con código ${cod} no encontrada`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.nomOcupacionCuoc !== undefined)
        ocupacion.nomOcupacionCuoc = dto.nomOcupacionCuoc;
      if (dto.descOcupacionCuoc !== undefined)
        ocupacion.descOcupacionCuoc = dto.descOcupacionCuoc;
      if (dto.fechaRegistro !== undefined)
        ocupacion.fechaRegistro = new Date(dto.fechaRegistro) as any;
      if (dto.estado !== undefined) ocupacion.estado = dto.estado;
      if (dto.fechaInactivacion !== undefined)
        ocupacion.fechaInactivacion = new Date(dto.fechaInactivacion) as any;
      if (dto.trazabilidad !== undefined)
        ocupacion.trazabilidad = dto.trazabilidad;
      if (dto.codGrupoPrim !== undefined)
        ocupacion.grupoPrimario = { codGrupoPrim: dto.codGrupoPrim } as CuocGrupoPrimario;
      if (dto.codNivel !== undefined) {
        ocupacion.nivelCompetencia = { codNivel: dto.codNivel } as CuocNivelCompetencia;
        const nivel = await queryRunner.manager.findOne(CuocNivelCompetencia, {
          where: { codNivel: dto.codNivel },
        });
        ocupacion.nombreNivel = nivel?.nombreNivel ?? null;
      }
      if (dto.codigoAreaCuoc !== undefined) {
        ocupacion.areaCualificacion = dto.codigoAreaCuoc
          ? ({ codigo: dto.codigoAreaCuoc } as CuocAreaCualificacion)
          : null;
        if (dto.codigoAreaCuoc) {
          const area = await queryRunner.manager.findOne(CuocAreaCualificacion, {
            where: { codigo: dto.codigoAreaCuoc },
          });
          ocupacion.nombre = area?.descripcion ?? null;
        } else {
          ocupacion.nombre = null;
        }
      }

      await queryRunner.manager.save(CuocOcupacion, ocupacion);

      if (dto.funciones !== undefined) {
        await queryRunner.manager.delete(CuocFuncion, {
          ocupacion: { codOcupacionCuoc: cod },
        });
        if (dto.funciones.length) {
          const funciones = dto.funciones.map((f) =>
            queryRunner.manager.create(CuocFuncion, {
              codFuncionCuoc: f.codFuncionCuoc,
              nomFuncionCuoc: f.nomFuncionCuoc,
              ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
            }),
          );
          await queryRunner.manager.save(CuocFuncion, funciones);
        }
      }

      if (dto.denominaciones !== undefined) {
        await queryRunner.manager.delete(CuocDenominacion, {
          ocupacion: { codOcupacionCuoc: cod },
        });
        if (dto.denominaciones.length) {
          const denoms = dto.denominaciones.map((d) =>
            queryRunner.manager.create(CuocDenominacion, {
              codDenominacion: d.codDenominacion,
              nomDenominacion: d.nomDenominacion,
              fuenteDenom: d.fuenteDenom,
              observacion: d.observacion,
              ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
            }),
          );
          await queryRunner.manager.save(CuocDenominacion, denoms);
        }
      }

      if (dto.regConocimientos !== undefined) {
        await queryRunner.manager.delete(CuocRegConocimiento, {
          ocupacion: { codOcupacionCuoc: cod },
        });
        if (dto.regConocimientos.length) {
          const concCodes = dto.regConocimientos.map((r) => r.codConocimiento);
          const concEntities = await queryRunner.manager.find(CuocConocimiento, {
            where: { codConocimiento: In(concCodes) },
          });
          const concMap = new Map(concEntities.map((c) => [c.codConocimiento, c.nombConocimiento]));

          const conocs = dto.regConocimientos.map((r) =>
            queryRunner.manager.create(CuocRegConocimiento, {
              ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
              conocimiento: { codConocimiento: r.codConocimiento } as CuocConocimiento,
              nombConocimiento: concMap.get(r.codConocimiento) ?? null,
            }),
          );
          await queryRunner.manager.save(CuocRegConocimiento, conocs);
        }
      }

      if (dto.destrezas !== undefined) {
        await queryRunner.manager.delete(CuocDestreza, {
          ocupacion: { codOcupacionCuoc: cod },
        });
        if (dto.destrezas.length) {
          const habCodes = dto.destrezas.map((d) => d.codHabDest);
          const habEntities = await queryRunner.manager.find(HabilidadDestreza, {
            where: { codHabDest: In(habCodes) },
          });
          const habMap = new Map(habEntities.map((h) => [h.codHabDest, h.nombHabDest]));

          const dests = dto.destrezas.map((d) =>
            queryRunner.manager.create(CuocDestreza, {
              ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
              habilidadDestreza: { codHabDest: d.codHabDest } as HabilidadDestreza,
              nombHabDest: habMap.get(d.codHabDest) ?? null,
            }),
          );
          await queryRunner.manager.save(CuocDestreza, dests);
        }
      }

      await queryRunner.commitTransaction();
      return this.findOne(cod);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** Columnas reales detrás de cada campo ordenable en CUOC. */
  private static readonly COLUMNAS_ORDEN_CUOC: Record<OrdenConsultaCuoc, string> = {
    codigo: 'o.cod_ocupacion_cuoc',
    nombre: 'o.nom_ocupacion_cuoc',
    estado: 'o.estado',
  };

  /**
   * Cuenta cuántos registros hijos tiene cada ocupación de la página.
   * Usa un GROUP BY en SQL para evitar traer todas las filas a memoria.
   *
   * @param soloActivos Para funciones y denominaciones: el cargue desactiva
   *   las que salen del Excel en vez de borrarlas, y no deben contarse.
   */
  private async contarPorOcupacionCuoc(
    repo: Repository<{ ocupacion?: CuocOcupacion }>,
    codigos: string[],
    soloActivos = false,
  ): Promise<Map<string, number>> {
    const relacion = repo.metadata.findRelationWithPropertyPath('ocupacion');
    const columna = relacion?.joinColumns[0]?.databaseName;
    if (!columna || codigos.length === 0) {
      return new Map();
    }

    const columnaSql = `"r"."${columna}"`;
    const filas = await repo
      .createQueryBuilder('r')
      .select(columnaSql, 'codigo')
      .addSelect('COUNT(*)', 'total')
      .where(`${columnaSql} IN (:...codigos)`, { codigos })
      .andWhere(soloActivos ? 'COALESCE("r"."estado", 1) <> 0' : '1 = 1')
      .groupBy(columnaSql)
      .getRawMany<{ codigo: string; total: string }>();

    return new Map(filas.map((f) => [f.codigo, Number(f.total)]));
  }

  /**
   * Tabla de resultados CUOC: texto + filtros + orden + paginación,
   * todo resuelto en la base de datos.
   */
  /**
   * Gran grupo y grupos primarios del catálogo, para los filtros de la tabla
   * de resultados. Cada grupo primario trae su gran grupo (subiendo por
   * subgrupo y subgrupo principal) para que el front los encadene.
   */
  async jerarquia(): Promise<{
    granGrupos: { codigo: string; nombre: string }[];
    gruposPrimarios: { codigo: string; nombre: string; granGrupo: string }[];
  }> {
    const [granGrupos, gruposPrimarios] = await Promise.all([
      this.dataSource.query(
        `SELECT cod_gran_grupo AS codigo, nom_gran_grupo AS nombre
           FROM clasificacion.cuoc_gran_grupo
          ORDER BY cod_gran_grupo`,
      ),
      this.dataSource.query(
        `SELECT gp.cod_grupo_prim AS codigo, gp.nom_grupo_prim AS nombre, sp.cod_gran_grupo AS "granGrupo"
           FROM clasificacion.cuoc_grupo_primario gp
           -- JOIN, no LEFT JOIN: deja fuera el grupo de relleno «0000» (sin
           -- subgrupo), que solo usa la ocupación obsoleta 00000.
           JOIN clasificacion.cuoc_subgrupo s ON s.cod_subgrupo_c = gp.cod_subgrupo_c
           JOIN clasificacion.cuoc_subgrupo_principal sp ON sp.cod_subgrupo_p = s.cod_subgrupo_p
          ORDER BY gp.cod_grupo_prim`,
      ),
    ]);
    return { granGrupos, gruposPrimarios };
  }

  async consultar({
    q,
    nivel,
    granGrupo,
    grupoPrimario,
    area,
    funcion,
    estado,
    page,
    limit,
    orden,
    direccion,
  }: ConsultarCuocOcupacionesDto): Promise<PageResponse<CuocOcupacionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.ocupacionRepo
      .createQueryBuilder('o')
      .select(['o.codOcupacionCuoc', 'o.nomOcupacionCuoc', 'o.estado'])
      .leftJoin('o.areaCualificacion', 'area')
      .addSelect(['area.codigo', 'area.descripcion'])
      .leftJoin('o.nivelCompetencia', 'nivel')
      .addSelect(['nivel.codNivel', 'nivel.nombreNivel'])
      .where('o.cod_ocupacion_cuoc ~ :patron AND o.cod_ocupacion_cuoc <> ALL(:excluidos)', {
        patron: CuocOcupacionService.SOLO_CATALOGO_OFICIAL,
        excluidos: CuocOcupacionService.CODIGOS_EXCLUIDOS,
      });

    const nombre = condicionTexto(['o.nom_ocupacion_cuoc'], termino);
    if (nombre) {
      query.andWhere(`(o.cod_ocupacion_cuoc ILIKE :prefijo OR ${nombre.sql})`, {
        prefijo: prefijoCodigo(termino),
        ...nombre.params,
      });
    }
    if (nivel) {
      query.andWhere('nivel.nombre_nivel = :nivel', { nivel });
    }
    if (area) {
      query.andWhere('area.descripcion = :area', { area });
    }
    if (grupoPrimario) {
      query.andWhere('o.cod_grupo_prim = :grupoPrimario', { grupoPrimario });
    }
    if (granGrupo) {
      // La ocupación solo guarda su grupo primario; el gran grupo se alcanza
      // subiendo por subgrupo y subgrupo principal.
      query.andWhere(
        `o.cod_grupo_prim IN (
           SELECT gp.cod_grupo_prim
             FROM clasificacion.cuoc_grupo_primario gp
             JOIN clasificacion.cuoc_subgrupo s ON s.cod_subgrupo_c = gp.cod_subgrupo_c
             JOIN clasificacion.cuoc_subgrupo_principal sp ON sp.cod_subgrupo_p = s.cod_subgrupo_p
            WHERE sp.cod_gran_grupo = :granGrupo)`,
        { granGrupo },
      );
    }
    if (funcion) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM clasificacion.cuoc_funciones f
          WHERE f.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc
            AND (f.cod_funcion_cuoc = :funcion OR f.nom_funcion_cuoc = :funcion)
        )`,
        { funcion },
      );
    }
    if (estado) {
      query.andWhere('o.estado = :estado', { estado: estado.toLowerCase() === 'activo' });
    }

    const [rows, total] = await query
      .orderBy(CuocOcupacionService.COLUMNAS_ORDEN_CUOC[orden], direccion)
      .addOrderBy('o.cod_ocupacion_cuoc', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const codigos = rows.map((o) => o.codOcupacionCuoc);
    const [denominaciones, funciones, destrezas, conocimientos] = await Promise.all([
      this.contarPorOcupacionCuoc(this.denominacionRepo, codigos, true),
      this.contarPorOcupacionCuoc(this.funcionRepo, codigos, true),
      this.contarPorOcupacionCuoc(this.destrezaRepo, codigos),
      this.contarPorOcupacionCuoc(this.regConocimientoRepo, codigos),
    ]);

    const data: CuocOcupacionResultado[] = rows.map((o) => ({
      codigo: o.codOcupacionCuoc,
      nombre: o.nomOcupacionCuoc ?? '',
      nivelCompetencia: o.nivelCompetencia?.nombreNivel ?? undefined,
      areaCualificacion: o.areaCualificacion?.descripcion ?? undefined,
      estado: o.estado ? 'Activo' : 'Inactivo',
      denominaciones: denominaciones.get(o.codOcupacionCuoc) ?? 0,
      funciones: funciones.get(o.codOcupacionCuoc) ?? 0,
      destrezas: destrezas.get(o.codOcupacionCuoc) ?? 0,
      conocimientos: conocimientos.get(o.codOcupacionCuoc) ?? 0,
    }));

    return buildPageResponse(data, total, { page, limit } as any);
  }

  async remove(cod: string): Promise<{ message: string }> {
    const ocupacion = await this.findOne(cod);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(CuocFuncion, {
        ocupacion: { codOcupacionCuoc: cod },
      });
      await queryRunner.manager.delete(CuocDenominacion, {
        ocupacion: { codOcupacionCuoc: cod },
      });
      await queryRunner.manager.delete(CuocRegConocimiento, {
        ocupacion: { codOcupacionCuoc: cod },
      });
      await queryRunner.manager.delete(CuocDestreza, {
        ocupacion: { codOcupacionCuoc: cod },
      });

      await queryRunner.manager.remove(CuocOcupacion, ocupacion);
      await queryRunner.commitTransaction();

      return {
        message: `Ocupación CUOC ${cod} — "${ocupacion.nomOcupacionCuoc}" eliminada correctamente`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
