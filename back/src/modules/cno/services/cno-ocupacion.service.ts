import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Raw } from 'typeorm';
import {
  CnoOcupacion,
  CnoRegFunciones,
  CnoDenominacion,
  CnoRegHabilidad,
  CnoRegConocimiento,
  CnoRelacionada,
  CnoAreaDesempeno,
  CnoNivelCualificacion,
  CnoConocimiento,
} from '../entities';
import { HabilidadDestreza } from '../../shared/entities/habilidad-destreza.entity';
import { CreateCnoOcupacionDto } from '../dto/create-cno-ocupacion.dto';
import { UpdateCnoOcupacionDto } from '../dto/update-cno-ocupacion.dto';
import {
  ConsultarOcupacionesDto,
  OcupacionResultado,
  OrdenConsulta,
} from '../dto/consultar-ocupaciones.dto';
import {
  BuscarOcupacionDto,
  OcupacionSugerencia,
} from '../../../common/dto/buscar-ocupacion.dto';
import { CnoFuncionesService } from './cno-funciones.service';
import { CnoDenominacionesService } from './cno-denominaciones.service';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { condicionTexto, ordenRelevancia, prefijoCodigo } from '../../../common/utils/busqueda-texto.util';

@Injectable()
export class CnoOcupacionService {
  private readonly RELATIONS = [
    'areaDesempeno',
    'nivelCualificacion',
    'denominaciones',
    'funciones',
    'funciones.funcion',
    'habilidades',
    'habilidades.habilidadDestreza',
    'conocimientos',
    'conocimientos.conocimiento',
    'relacionadas',
  ];

  constructor(
    @InjectRepository(CnoOcupacion)
    private readonly ocupacionRepo: Repository<CnoOcupacion>,

    @InjectRepository(CnoRegFunciones)
    private readonly regFuncionesRepo: Repository<CnoRegFunciones>,

    @InjectRepository(CnoDenominacion)
    private readonly regDenominacionRepo: Repository<CnoDenominacion>,

    @InjectRepository(CnoRegHabilidad)
    private readonly regHabilidadRepo: Repository<CnoRegHabilidad>,

    @InjectRepository(CnoRegConocimiento)
    private readonly regConocimientoRepo: Repository<CnoRegConocimiento>,

    @InjectRepository(CnoRelacionada)
    private readonly relacionadaRepo: Repository<CnoRelacionada>,

    private readonly dataSource: DataSource,

    private readonly cnoFuncionesService: CnoFuncionesService,

    private readonly cnoDenominacionesService: CnoDenominacionesService,
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
 * Un codigo oficial es exactamente 4 digitos, sin excepciones (verificado contra
 * los 612 registros de la tabla), asi que ese patron separa el catalogo de las
 * copias sin depender de como se construya el sufijo.
 *
 * El patron por si solo deja pasar '0000' ("Sin Clasificacion"), una fila
 * placeholder que no es una ocupacion real: no aparece en el catalogo oficial
 * (2CNO_2024_(2025-06-13).xlsx, 611 ocupaciones) y hasta ahora inflaba en 1 el
 * total que se muestra en Inicio (612 en vez de 611). Se excluye aparte.
 *
 * `findOne` NO aplica este filtro a proposito: Instrumento 2 y el detalle de una
 * copia necesitan poder resolverla por codigo exacto.
 */
  private static readonly SOLO_CATALOGO_OFICIAL = "^[0-9]{4}$";
  private static readonly CODIGO_SIN_CLASIFICAR = '0000';

  async findAll(pagination: PaginationDto): Promise<PageResponse<CnoOcupacion>> {
    try {
      // No se cargan las relaciones OneToMany (denominaciones, funciones, habilidades,
      // conocimientos, relacionadas) con un solo `find` + `relations`: TypeORM las trae
      // encadenando LEFT JOINs, y el producto cartesiano de 5 relaciones OneToMany por
      // cada ocupación multiplica las filas devueltas por Postgres a varios millones,
      // lo que puede tardar decenas de segundos e incluso tumbar el proceso.
      // En su lugar, se trae cada relación por separado con un IN sobre los códigos
      // de la página actual y se arma el objeto en memoria.
      const [ocupaciones, total] = await this.ocupacionRepo.findAndCount({
        where: {
          codOcupacionCno: Raw((alias) => `${alias} ~ :patron AND ${alias} <> :excluido`, {
            patron: CnoOcupacionService.SOLO_CATALOGO_OFICIAL,
            excluido: CnoOcupacionService.CODIGO_SIN_CLASIFICAR,
          }),
        },
        order: { codOcupacionCno: 'ASC' },
        relations: ['areaDesempeno', 'nivelCualificacion'],
        skip: pagination.skip,
        take: pagination.limit,
      });

      const codigos = ocupaciones.map((o) => o.codOcupacionCno);

      const [denominaciones, funciones, habilidades, conocimientos, relacionadas] =
        codigos.length === 0
          ? [[], [], [], [], []]
          : await Promise.all([
              this.regDenominacionRepo.find({
                where: { ocupacion: { codOcupacionCno: In(codigos) } },
                relations: ['ocupacion'],
              }),
              this.regFuncionesRepo.find({
                where: { ocupacion: { codOcupacionCno: In(codigos) } },
                relations: ['funcion', 'ocupacion'],
              }),
              this.regHabilidadRepo.find({
                where: { ocupacion: { codOcupacionCno: In(codigos) } },
                relations: ['habilidadDestreza', 'ocupacion'],
              }),
              this.regConocimientoRepo.find({
                where: { ocupacion: { codOcupacionCno: In(codigos) } },
                relations: ['conocimiento', 'ocupacion'],
              }),
              this.relacionadaRepo.find({
                where: { ocupacion: { codOcupacionCno: In(codigos) } },
                relations: ['ocupacion'],
              }),
            ]);

      const groupByOcupacion = <T extends { ocupacion?: CnoOcupacion }>(
        items: T[],
      ): Map<string, T[]> => {
        const map = new Map<string, T[]>();
        for (const item of items) {
          const cod = item.ocupacion?.codOcupacionCno;
          delete item.ocupacion;
          if (!cod) continue;
          if (!map.has(cod)) map.set(cod, []);
          map.get(cod)!.push(item);
        }
        return map;
      };

      const denomMap = groupByOcupacion(denominaciones);
      const funcMap = groupByOcupacion(funciones);
      const habMap = groupByOcupacion(habilidades);
      const conocMap = groupByOcupacion(conocimientos);
      const relMap = groupByOcupacion(relacionadas);

      for (const ocupacion of ocupaciones) {
        const cod = ocupacion.codOcupacionCno;
        ocupacion.denominaciones = denomMap.get(cod) ?? [];
        ocupacion.funciones = funcMap.get(cod) ?? [];
        ocupacion.habilidades = habMap.get(cod) ?? [];
        ocupacion.conocimientos = conocMap.get(cod) ?? [];
        ocupacion.relacionadas = relMap.get(cod) ?? [];
      }

      return buildPageResponse(ocupaciones, total, pagination);
    } catch (error) {
      console.error('ERROR EN findAll CNO:');
      console.error(error);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Sugerencias para el autocompletado: sólo código y nombre, sin relaciones.
   *
   * El front antes descargaba el catálogo completo (todas las ocupaciones con
   * sus 5 relaciones) al entrar a la vista, únicamente para poder filtrar en
   * memoria mientras el usuario escribía. Esta consulta devuelve como mucho
   * `limit` filas y dos columnas, así que responde en milisegundos y permite
   * que la pantalla cargue sin pedir nada.
   */
  async buscar(
    { q, limit }: BuscarOcupacionDto,
    { porDenominacion = false }: { porDenominacion?: boolean } = {},
  ): Promise<OcupacionSugerencia[]> {
    const termino = (q ?? '').trim();
    if (!termino) {
      return [];
    }

    const nombre = condicionTexto(['o.nomb_ocupacion_cno'], termino)!;
    const relevancia = ordenRelevancia('o.cod_ocupacion_cno', 'o.nomb_ocupacion_cno', termino)!;
    // Con porDenominacion, la ocupación aparece también si alguna de sus
    // denominaciones activas contiene todas las palabras.
    const denom = porDenominacion ? condicionTexto(['d.desc_denominacion'], termino) : null;
    const porDenom = denom
      ? ` OR EXISTS (SELECT 1 FROM cno_denominacion d
            WHERE d.cno_cod_ocupacion = o.cod_ocupacion_cno AND d.estado = 1 AND ${denom.sql})`
      : '';

    const rows = await this.ocupacionRepo
      .createQueryBuilder('o')
      .select(['o.codOcupacionCno', 'o.nombOcupacionCno'])
      // El area viaja en la sugerencia para que el buscador pueda mostrar una
      // linea de contexto bajo cada resultado. Es leftJoin y no innerJoin: una
      // ocupacion sin area debe seguir apareciendo en el autocompletado.
      .leftJoin('o.areaDesempeno', 'area')
      .addSelect(['area.codDesempeno', 'area.nomDesempeno'])
      // El código se busca por prefijo (el usuario teclea "211..." de izquierda
      // a derecha) y el nombre por contenido. Van agrupados en un solo where: sin
      // el parentesis, el andWhere del filtro de catalogo se aplicaria solo a la
      // segunda condicion y las copias seguirian saliendo al buscar por codigo.
      .where(
        `(o.cod_ocupacion_cno ILIKE :prefijo OR ${nombre.sql}${porDenom})`,
        { prefijo: prefijoCodigo(termino), ...nombre.params },
      )
      .andWhere('o.cod_ocupacion_cno ~ :patron AND o.cod_ocupacion_cno <> :excluido', {
        patron: CnoOcupacionService.SOLO_CATALOGO_OFICIAL,
        excluido: CnoOcupacionService.CODIGO_SIN_CLASIFICAR,
      })
      .addSelect(relevancia.sql, 'relevancia')
      .setParameters(relevancia.params)
      .orderBy('relevancia', 'ASC')
      .addOrderBy('o.cod_ocupacion_cno', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((o) => ({
      codigo: o.codOcupacionCno,
      nombre: o.nombOcupacionCno ?? '',
      area: o.areaDesempeno?.nomDesempeno ?? undefined,
    }));
  }

  /** Columnas reales detrás de cada campo ordenable: el front nunca elige SQL. */
  private static readonly COLUMNAS_ORDEN: Record<OrdenConsulta, string> = {
    codigo: 'o.cod_ocupacion_cno',
    nombre: 'o.nomb_ocupacion_cno',
    // Por código: «Nivel 1 (A)» < «Nivel 2 (B)» < … sigue el orden oficial.
    nivel: 'nivel.cod_cualificacion',
    estado: 'o.estado',
  };

  /**
   * Cuenta, agrupando en SQL, cuántos registros hijos tiene cada ocupación de
   * la página. Se usa en lugar de `loadRelationCountAndMap`, que en estas
   * entidades siempre devuelve 0: la clave primaria es de texto y además hay
   * una columna `id` @Generated que no es la PK, y el cargador de conteos de
   * TypeORM termina cruzando por la columna equivocada.
   */
  private async contarPorOcupacion(
    repo: Repository<{ ocupacion?: CnoOcupacion }>,
    codigos: string[],
  ): Promise<Map<string, number>> {
    const relacion = repo.metadata.findRelationWithPropertyPath('ocupacion');
    const columna = relacion?.joinColumns[0]?.databaseName;
    if (!columna || codigos.length === 0) {
      return new Map();
    }

    // Referencia cruda a la columna FK: su nombre cambia entre tablas
    // (cno_cod_ocupacion, cno_ocupacion, cod_ocupacion_cno) y no siempre existe
    // como propiedad de la entidad, así que se resuelve desde los metadatos.
    const columnaSql = `"r"."${columna}"`;

    const filas = await repo
      .createQueryBuilder('r')
      .select(columnaSql, 'codigo')
      .addSelect('COUNT(*)', 'total')
      .where(`${columnaSql} IN (:...codigos)`, { codigos })
      .groupBy(columnaSql)
      .getRawMany<{ codigo: string; total: string }>();

    return new Map(filas.map((f) => [f.codigo, Number(f.total)]));
  }

  /**
   * Consulta de la tabla de resultados: texto + filtros + orden + paginación,
   * todo resuelto en la base de datos.
   *
   * Devuelve además cuántos registros tiene cada bloque (denominaciones,
   * funciones, habilidades, conocimientos) con consultas COUNT agrupadas sobre
   * los códigos de la página. Traer las listas completas sólo para contarlas
   * multiplicaría las filas de Postgres por el producto de las relaciones.
   */
  async consultar({
    q,
    nivel,
    area,
    funcion,
    estado,
    page,
    limit,
    orden,
    direccion,
  }: ConsultarOcupacionesDto): Promise<PageResponse<OcupacionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.ocupacionRepo
      .createQueryBuilder('o')
      .select(['o.codOcupacionCno', 'o.nombOcupacionCno', 'o.estado'])
      // leftJoin y no innerJoin: una ocupación sin área o sin nivel debe seguir
      // apareciendo en los resultados.
      .leftJoin('o.areaDesempeno', 'area')
      .addSelect(['area.codDesempeno', 'area.nomDesempeno'])
      .leftJoin('o.nivelCualificacion', 'nivel')
      .addSelect(['nivel.codCualificacion', 'nivel.nivelesCualificacion'])
      .where('o.cod_ocupacion_cno ~ :patron AND o.cod_ocupacion_cno <> :excluido', {
        patron: CnoOcupacionService.SOLO_CATALOGO_OFICIAL,
        excluido: CnoOcupacionService.CODIGO_SIN_CLASIFICAR,
      });

    const nombre = condicionTexto(['o.nomb_ocupacion_cno'], termino);
    if (nombre) {
      // El código se busca por prefijo (los códigos CNO son jerárquicos y se
      // teclean de izquierda a derecha) y el nombre por palabras, sin tildes.
      query.andWhere(`(o.cod_ocupacion_cno ILIKE :prefijo OR ${nombre.sql})`, {
        prefijo: prefijoCodigo(termino),
        ...nombre.params,
      });
    }
    if (nivel) {
      query.andWhere('nivel.niveles_cualificacion = :nivel', { nivel });
    }
    if (area) {
      query.andWhere('area.nom_desempeno = :area', { area });
    }
    if (funcion) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM clasificacion.cno_reg_funciones rf
          WHERE rf.cno_ocupacion = o.cod_ocupacion_cno
            AND (rf.cod_funcion = :funcion OR rf.desc_funcion_cno = :funcion)
        )`,
        { funcion },
      );
    }
    if (estado) {
      query.andWhere('o.estado = :estado', { estado: estado.toLowerCase() === 'activo' });
    }

    const [rows, total] = await query
      .orderBy(CnoOcupacionService.COLUMNAS_ORDEN[orden], direccion)
      // Desempate estable: sin él, dos ocupaciones con el mismo nivel (o el
      // mismo estado) pueden cambiar de página entre consultas.
      .addOrderBy('o.cod_ocupacion_cno', 'ASC')
      // offset/limit y NO skip/take: skip/take activa la estrategia de
      // subconsulta por ids distintos de TypeORM, que revienta con esta entidad
      // ("Cannot read properties of undefined (reading 'databaseName')") porque
      // `id` es una columna @Generated que no es la clave primaria. Aquí el
      // LIMIT crudo es equivalente: la consulta sólo une relaciones ManyToOne
      // (área y nivel), así que ninguna ocupación se multiplica en filas.
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const codigos = rows.map((o) => o.codOcupacionCno);
    const [denominaciones, funciones, habilidades, conocimientos] = await Promise.all([
      this.contarPorOcupacion(this.regDenominacionRepo, codigos),
      this.contarPorOcupacion(this.regFuncionesRepo, codigos),
      this.contarPorOcupacion(this.regHabilidadRepo, codigos),
      this.contarPorOcupacion(this.regConocimientoRepo, codigos),
    ]);

    const data = rows.map((o) => ({
      codigo: o.codOcupacionCno,
      nombre: o.nombOcupacionCno ?? '',
      codNivelCualificacion: o.nivelCualificacion?.codCualificacion ?? undefined,
      nivelCualificacion: o.nivelCualificacion?.nivelesCualificacion ?? undefined,
      areaDesempeno: o.areaDesempeno?.nomDesempeno ?? undefined,
      estado: o.estado ? 'Activo' : 'Inactivo',
      denominaciones: denominaciones.get(o.codOcupacionCno) ?? 0,
      funciones: funciones.get(o.codOcupacionCno) ?? 0,
      habilidades: habilidades.get(o.codOcupacionCno) ?? 0,
      conocimientos: conocimientos.get(o.codOcupacionCno) ?? 0,
    }));

    return buildPageResponse(data, total, { page, limit } as PaginationDto);
  }

  async findOne(cod: string): Promise<CnoOcupacion> {
    try {
      const ocupacion = await this.ocupacionRepo.findOne({
        where: { codOcupacionCno: cod },
        relations: this.RELATIONS,
        // FIX: Cargar cada relación con una query separada en lugar de LEFT JOINs encadenados.
        // Sin esto, múltiples OneToMany producen un producto cartesiano y duplican filas
        // (ej: 6 funciones × 5 conocimientos = 30 filas, TypeORM no siempre deduplica).
        relationLoadStrategy: 'query',
      });

      if (!ocupacion) {
        throw new NotFoundException(
          `Ocupación CNO con código ${cod} no encontrada`,
        );
      }

      return ocupacion;
    } catch (error) {
      console.error('ERROR EN findOne CNO:');
      console.error(error);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  async create(dto: CreateCnoOcupacionDto): Promise<CnoOcupacion> {
    // Comparación de fechas ISO (YYYY-MM-DD) como texto; hoy en hora de Colombia.
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    if (dto.fechaRegistro.slice(0, 10) > hoy) {
      throw new BadRequestException('La fecha de registro no puede ser posterior a hoy.');
    }

    const exists = await this.ocupacionRepo.findOne({
      where: { codOcupacionCno: dto.codOcupacionCno },
    });
    if (exists) {
      throw new ConflictException(
        `Ya existe una ocupación CNO con código ${dto.codOcupacionCno}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const ocupacion = queryRunner.manager.create(CnoOcupacion, {
        codOcupacionCno: dto.codOcupacionCno,
        nombOcupacionCno: dto.nombOcupacionCno,
        descripcion: dto.descripcion,
        estado: dto.estado,
        trazabilidad: dto.trazabilidad,
        fechaInactivacion: dto.fechaInactivacion ? new Date(dto.fechaInactivacion) : undefined,
        fechaRegistro: dto.fechaRegistro ? new Date(dto.fechaRegistro) : undefined,
        areaDesempeno: dto.codDesempeno
          ? ({ codDesempeno: dto.codDesempeno } as CnoAreaDesempeno)
          : undefined,
        nivelCualificacion: dto.codCualificacion
          ? ({ codCualificacion: dto.codCualificacion } as CnoNivelCualificacion)
          : undefined,
      });

      if (dto.codDesempeno) {
        const area = await queryRunner.manager.findOne(CnoAreaDesempeno, {
          where: { codDesempeno: dto.codDesempeno },
        });
        if (area) ocupacion.nomDesempeno = area.nomDesempeno;
      }
      if (dto.codCualificacion) {
        const nivel = await queryRunner.manager.findOne(CnoNivelCualificacion, {
          where: { codCualificacion: dto.codCualificacion },
        });
        if (nivel) ocupacion.nivelesCualificacion = nivel.nivelesCualificacion;
      }

      await queryRunner.manager.save(CnoOcupacion, ocupacion);

      // Denominaciones y funciones se crean/vinculan de forma secuencial (no en
      // paralelo) para que sus consecutivos (D-{cod}.NNN / F-{cod}.NNN) se
      // calculen uno tras otro dentro de la misma transacción. La lógica de
      // cada dominio vive en su propio servicio; aquí solo se orquesta.
      for (const d of dto.denominaciones ?? []) {
        await this.cnoDenominacionesService.crear(dto.codOcupacionCno, d, queryRunner.manager);
      }

      for (const f of dto.funciones ?? []) {
        await this.cnoFuncionesService.vincularAOcupacion(dto.codOcupacionCno, f, queryRunner.manager);
      }

      if (dto.conocimientos?.length) {
        const conocCodes = dto.conocimientos.map((c) => c.codConocimiento);
        const conocEntities = await queryRunner.manager.find(CnoConocimiento, {
          where: { codConocimiento: In(conocCodes) },
        });
        const conocMap = new Map(
          conocEntities.map((c) => [c.codConocimiento, c.nombConocimiento]),
        );

        const conocimientos = dto.conocimientos.map((c) =>
          queryRunner.manager.create(CnoRegConocimiento, {
            conocimiento: { codConocimiento: c.codConocimiento } as CnoConocimiento,
            ocupacion: { codOcupacionCno: dto.codOcupacionCno } as CnoOcupacion,
            nombConocimiento: conocMap.get(c.codConocimiento) ?? null,
          }),
        );
        await queryRunner.manager.save(CnoRegConocimiento, conocimientos);
      }

      if (dto.habilidades?.length) {
        const habCodes = dto.habilidades.map((h) => h.codHabilidad);
        const habEntities = await queryRunner.manager.find(HabilidadDestreza, {
          where: { codHabDest: In(habCodes) },
        });
        const habMap = new Map(habEntities.map((h) => [h.codHabDest, h.nombHabDest]));

        const habilidades = dto.habilidades.map((h) =>
          queryRunner.manager.create(CnoRegHabilidad, {
            habilidadDestreza: { codHabDest: h.codHabilidad } as HabilidadDestreza,
            ocupacion: { codOcupacionCno: dto.codOcupacionCno } as CnoOcupacion,
            nombHabDest: habMap.get(h.codHabilidad) ?? null,
          }),
        );
        await queryRunner.manager.save(CnoRegHabilidad, habilidades);
      }

      if (dto.relacionadas?.length) {
        const relacionadas = dto.relacionadas.map((r) =>
          queryRunner.manager.create(CnoRelacionada, {
            nombreOcupacion: r.nombreOcupacion,
            codigoOcupacion: r.codigoOcupacion,
            nombreCnoRelacionada: r.nombreCnoRelacionada,
            ocupacion: { codOcupacionCno: dto.codOcupacionCno } as CnoOcupacion,
          }),
        );
        await queryRunner.manager.save(CnoRelacionada, relacionadas);
      }

      await queryRunner.commitTransaction();
      return this.findOne(dto.codOcupacionCno);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Actualiza los campos propios de la ocupación (nombre, descripción, área,
   * nivel, trazabilidad, estado). Denominaciones, funciones, habilidades,
   * conocimientos y relacionadas NO se tocan aquí: ya tienen su propio
   * endpoint y pantalla dedicados. Mismo alcance que
   * CuocOcupacionService.update() para los campos que sí comparte.
   */
  async update(cod: string, dto: UpdateCnoOcupacionDto): Promise<CnoOcupacion> {
    const ocupacion = await this.findOne(cod);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.nombOcupacionCno !== undefined) ocupacion.nombOcupacionCno = dto.nombOcupacionCno;
      if (dto.descripcion !== undefined) ocupacion.descripcion = dto.descripcion;
      if (dto.estado !== undefined) ocupacion.estado = dto.estado;
      if (dto.trazabilidad !== undefined) ocupacion.trazabilidad = dto.trazabilidad;
      if (dto.fechaInactivacion !== undefined)
        ocupacion.fechaInactivacion = new Date(dto.fechaInactivacion) as any;
      if (dto.fechaRegistro !== undefined)
        ocupacion.fechaRegistro = new Date(dto.fechaRegistro) as any;

      if (dto.codDesempeno !== undefined) {
        ocupacion.areaDesempeno = { codDesempeno: dto.codDesempeno } as CnoAreaDesempeno;
        const area = await queryRunner.manager.findOne(CnoAreaDesempeno, {
          where: { codDesempeno: dto.codDesempeno },
        });
        ocupacion.nomDesempeno = area?.nomDesempeno ?? null;
      }

      if (dto.codCualificacion !== undefined) {
        ocupacion.nivelCualificacion = { codCualificacion: dto.codCualificacion } as CnoNivelCualificacion;
        const nivel = await queryRunner.manager.findOne(CnoNivelCualificacion, {
          where: { codCualificacion: dto.codCualificacion },
        });
        ocupacion.nivelesCualificacion = nivel?.nivelesCualificacion ?? null;
      }

      await queryRunner.manager.save(CnoOcupacion, ocupacion);
      await queryRunner.commitTransaction();

      return this.findOne(cod);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(cod: string): Promise<{ message: string }> {
    const ocupacion = await this.findOne(cod);

    // Las comparativas son el registro de un análisis ya hecho (Instrumento 2):
    // borrarlas o dejarlas sin ocupación perdería ese historial, así que la
    // ocupación en uso no se elimina, igual que los catálogos en uso.
    const [{ total: enComparativas }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM clasificacion.comparativa_ocupacion WHERE cod_ocupacion_cno = $1`,
      [cod],
    );
    if (enComparativas > 0) {
      throw new ConflictException(
        `La ocupación CNO ${cod} no se puede eliminar: está en ${enComparativas} comparativa(s) de análisis. ` +
          'Inactívala en lugar de eliminarla.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Correlativas y conocimientos también apuntan a la ocupación (o a sus
      // denominaciones) con FK; sin borrarlos antes, el DELETE final fallaba
      // con un 500. Una correlativa sin su ocupación CNO no significa nada.
      await queryRunner.query(
        `DELETE FROM clasificacion.correlativa_denominacion
          WHERE cod_ocupacion_cno = $1
             OR cod_denominacion_cno IN (SELECT cod_denominacion_cno FROM clasificacion.cno_denominacion WHERE cno_cod_ocupacion = $1)`,
        [cod],
      );
      await queryRunner.query(`DELETE FROM clasificacion.correlativa_ocupacion WHERE cno_ocupacion_cno = $1`, [cod]);
      await queryRunner.query(`DELETE FROM clasificacion.cno_reg_conocimiento WHERE cod_ocupacion_cno = $1`, [cod]);

      await queryRunner.manager.delete(CnoRegFunciones, { ocupacion: { codOcupacionCno: cod } });
      await queryRunner.manager.delete(CnoDenominacion, { ocupacion: { codOcupacionCno: cod } });
      await queryRunner.manager.delete(CnoRegHabilidad, { ocupacion: { codOcupacionCno: cod } });
      await queryRunner.manager.delete(CnoRelacionada, { ocupacion: { codOcupacionCno: cod } });

      await queryRunner.manager.remove(CnoOcupacion, ocupacion);
      await queryRunner.commitTransaction();

      return {
        message: `Ocupación CNO ${cod} — "${ocupacion.nombOcupacionCno}" eliminada correctamente`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
