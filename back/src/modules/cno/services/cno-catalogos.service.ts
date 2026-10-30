import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActualizarNivelCopiaDto, ConsultarNivelesDto, CrearNivelCopiaDto, CrearNivelDto } from '../../../common/dto/nivel-copia.dto';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import {
  CatalogoSimple,
  actualizarItemCatalogo,
  crearItemCatalogo,
  eliminarItemCatalogo,
} from '../../../common/utils/catalogo-simple.util';
import { siguienteConsecutivo } from '../utils/cno-secuencia.util';
import { HABILIDADES_DESTREZAS } from '../../shared/habilidades-destrezas.catalogo';
import {
  CnoFuncion,
  CnoAreaDesempeno,
  CnoNivelCualificacion,
  CnoConocimiento,
  CnoDenominacion,
} from '../entities';
import { HabilidadDestreza } from '../../shared/entities/habilidad-destreza.entity';
import { CnoFuncionesService } from './cno-funciones.service';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';

const AREAS_DESEMPENO: CatalogoSimple<CnoAreaDesempeno> = {
  entidad: CnoAreaDesempeno,
  tabla: 'cno_area_desempeno',
  colCodigo: 'cod_desempeno',
  colNombre: 'nom_desempeno',
  colDescripcion: 'descripcion',
  codigo: 'texto',
  etiqueta: 'un área de desempeño',
  nombresCopiados: [{ tabla: 'cno_ocupacion', colCodigo: 'cod_desempeno_cno', colNombre: 'nom_desempeno' }],
  usos: [{ tabla: 'cno_ocupacion', colCodigo: 'cod_desempeno_cno', descripcion: 'ocupación(es) CNO' }],
};

const CONOCIMIENTOS_CNO: CatalogoSimple<CnoConocimiento> = {
  entidad: CnoConocimiento,
  tabla: 'cno_conocimiento',
  colCodigo: 'cod_conocimiento',
  colNombre: 'nomb_conocimiento',
  colDescripcion: 'desc_conocimiento',
  codigo: 'entero',
  etiqueta: 'un conocimiento CNO',
  nombresCopiados: [
    { tabla: 'cno_reg_conocimiento', colCodigo: 'cod_conocimiento', colNombre: 'nomb_conocimiento' },
    { tabla: 'correlativa_conocimiento', colCodigo: 'cod_conocimiento_cno', colNombre: 'nomb_conocimiento_cno' },
  ],
  usos: [
    { tabla: 'cno_reg_conocimiento', colCodigo: 'cod_conocimiento', descripcion: 'ocupación(es) CNO' },
    { tabla: 'correlativa_conocimiento', colCodigo: 'cod_conocimiento_cno', descripcion: 'correlativa(s)' },
  ],
};

@Injectable()
export class CnoCatalogosService {
  constructor(
    @InjectRepository(CnoAreaDesempeno)
    private readonly areaDesempenoRepo: Repository<CnoAreaDesempeno>,

    @InjectRepository(CnoNivelCualificacion)
    private readonly nivelCualificacionRepo: Repository<CnoNivelCualificacion>,

    @InjectRepository(CnoConocimiento)
    private readonly conocimientoRepo: Repository<CnoConocimiento>,

    @InjectRepository(CnoDenominacion)
    private readonly denominacionRepo: Repository<CnoDenominacion>,

    @InjectRepository(HabilidadDestreza)
    private readonly habilidadRepo: Repository<HabilidadDestreza>,

    private readonly cnoFuncionesService: CnoFuncionesService,

    private readonly dataSource: DataSource,
  ) {}

  /** Delegado: CnoFuncionesService es el único dueño de la lectura/escritura de cno_funcion. */
  findAllFunciones(pagination: PaginationDto): Promise<PageResponse<CnoFuncion>> {
    return this.cnoFuncionesService.findAll(pagination);
  }

  async findAllAreasDesempeno(pagination: PaginationDto): Promise<PageResponse<CnoAreaDesempeno>> {
    const [data, total] = await this.areaDesempenoRepo.findAndCount({
      order: { codDesempeno: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  /** Por defecto solo el catálogo oficial; con incluirCopias suma las copias de Análisis (al final). */
  async findAllNivelesCualificacion(consulta: ConsultarNivelesDto): Promise<PageResponse<CnoNivelCualificacion>> {
    const [data, total] = await this.nivelCualificacionRepo.findAndCount({
      where: consulta.incluirCopias ? {} : { esCopia: false },
      order: { esCopia: 'ASC', codCualificacion: 'ASC' },
      skip: consulta.skip,
      take: consulta.limit,
    });
    return buildPageResponse(data, total, consulta);
  }

  // ── Niveles ──────────────────────────────────────────────────────────────
  // Actualización crea/edita/elimina niveles del catálogo OFICIAL. Análisis
  // crea COPIAS (es_copia, código C1, C2…) que solo se usan allí.

  async crearNivel(dto: CrearNivelDto): Promise<CnoNivelCualificacion> {
    return this.dataSource.transaction(async (manager) => {
      const codigo = dto.codigo.trim();
      if (/^C\d+$/i.test(codigo)) {
        throw new BadRequestException('Los códigos C1, C2… están reservados para las copias de Análisis.');
      }
      if (await manager.findOne(CnoNivelCualificacion, { where: { codCualificacion: codigo } })) {
        throw new ConflictException(`Ya existe un nivel con el código ${codigo}.`);
      }
      const nombre = dto.nombre.trim();
      await this.exigirNombreNivelLibre(manager, nombre, null);
      return manager.save(
        CnoNivelCualificacion,
        manager.create(CnoNivelCualificacion, {
          codCualificacion: codigo,
          nivelesCualificacion: nombre,
          descripcion: dto.descripcion?.trim() || null,
          esCopia: false,
        }),
      );
    });
  }

  async crearCopiaNivel(dto: CrearNivelCopiaDto): Promise<CnoNivelCualificacion> {
    return this.dataSource.transaction(async (manager) => {
      const codOriginal = dto.codOriginal?.trim() || null;
      if (codOriginal) {
        const original = await manager.findOne(CnoNivelCualificacion, { where: { codCualificacion: codOriginal } });
        if (!original) throw new NotFoundException(`No existe el nivel ${codOriginal}.`);
        if (original.esCopia) {
          throw new BadRequestException('Ese nivel ya es una copia: edítalo directamente en lugar de copiarlo.');
        }
      }

      const nombre = dto.nombre.trim();
      await this.exigirNombreNivelLibre(manager, nombre, null);

      const siguiente = await siguienteConsecutivo(
        manager,
        'cno_nivel_copia',
        `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_cualificacion FROM '^C([0-9]+)$') AS INT)), 0) + 1 AS next
         FROM cno_nivel_cualificacion WHERE es_copia`,
        [],
      );

      const copia = manager.create(CnoNivelCualificacion, {
        codCualificacion: `C${siguiente}`,
        nivelesCualificacion: nombre,
        descripcion: dto.descripcion?.trim() || null,
        esCopia: true,
        codOriginal,
        creadoEn: new Date(),
      });
      return manager.save(CnoNivelCualificacion, copia);
    });
  }

  /** Edita cualquier nivel (oficial o copia). El código no cambia. */
  async actualizarNivel(cod: string, dto: ActualizarNivelCopiaDto): Promise<CnoNivelCualificacion> {
    return this.dataSource.transaction(async (manager) => {
      const nivel = await this.buscarNivel(manager, cod);

      if (dto.nombre !== undefined) {
        const nombre = dto.nombre.trim();
        await this.exigirNombreNivelLibre(manager, nombre, nivel.codCualificacion);
        nivel.nivelesCualificacion = nombre;
        // Las ocupaciones guardan también el nombre del nivel como texto.
        await manager.query(
          'UPDATE cno_ocupacion SET niveles_cualificacion = $1 WHERE cod_cualificacion_cno = $2',
          [nombre, nivel.codCualificacion],
        );
      }
      if (dto.descripcion !== undefined) nivel.descripcion = dto.descripcion.trim() || null;
      return manager.save(CnoNivelCualificacion, nivel);
    });
  }

  /** Elimina un nivel solo si ninguna ocupación (oficial o de Análisis) lo usa. */
  async eliminarNivel(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const nivel = await this.buscarNivel(manager, cod);
      const [{ usos }] = await manager.query(
        'SELECT count(*)::int AS usos FROM cno_ocupacion WHERE cod_cualificacion_cno = $1',
        [nivel.codCualificacion],
      );
      if (usos > 0) {
        throw new ConflictException(
          `No se puede eliminar: ${usos} ocupación(es) usan el nivel "${nivel.nivelesCualificacion}".`,
        );
      }
      await manager.delete(CnoNivelCualificacion, { codCualificacion: nivel.codCualificacion });
      return { message: `Nivel ${nivel.codCualificacion} eliminado.` };
    });
  }

  private async buscarNivel(manager: EntityManager, cod: string): Promise<CnoNivelCualificacion> {
    const nivel = await manager.findOne(CnoNivelCualificacion, { where: { codCualificacion: cod } });
    if (!nivel) throw new NotFoundException(`No existe el nivel ${cod}.`);
    return nivel;
  }

  /** Análisis identifica el nivel por su nombre: dos niveles con el mismo nombre serían indistinguibles. */
  private async exigirNombreNivelLibre(manager: EntityManager, nombre: string, excepto: string | null): Promise<void> {
    const [{ existe }] = await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM cno_nivel_cualificacion
         WHERE lower(trim(niveles_cualificacion)) = lower($1) AND ($2::text IS NULL OR cod_cualificacion <> $2)
       ) AS existe`,
      [nombre, excepto],
    );
    if (existe) {
      throw new ConflictException(
        `Ya existe un nivel llamado "${nombre}". Usa un nombre distinto: Análisis identifica los niveles por su nombre.`,
      );
    }
  }

  async findAllConocimientos(pagination: PaginationDto): Promise<PageResponse<CnoConocimiento>> {
    const [data, total] = await this.conocimientoRepo.findAndCount({
      order: { nombConocimiento: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  /**
   * Las habilidades de CNO: las que usa alguna ocupación CNO y las que aún no
   * usa nadie (recién creadas). Se excluyen las que solo usa CUOC (destrezas).
   */
  async findAllHabilidades(pagination: PaginationDto): Promise<PageResponse<HabilidadDestreza>> {
    const qb = this.habilidadRepo
      .createQueryBuilder('h')
      .where(
        `(EXISTS (SELECT 1 FROM clasificacion.cno_reg_habilidad r WHERE r.codigo_habilidad = h.cod_hab_dest)
          OR NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_destreza d WHERE d.codigo_destreza = h.cod_hab_dest))`,
      )
      .orderBy('h.nombHabDest', 'ASC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPageResponse(data, total, pagination);
  }

  // ── Áreas, habilidades y conocimientos ──────────────────────────────────
  // Actualización edita siempre el catálogo OFICIAL.

  crearArea(dto: CrearItemCatalogoDto): Promise<CnoAreaDesempeno> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, AREAS_DESEMPENO, dto));
  }

  actualizarArea(cod: string, dto: ActualizarItemCatalogoDto): Promise<CnoAreaDesempeno> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, AREAS_DESEMPENO, cod, dto));
  }

  eliminarArea(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, AREAS_DESEMPENO, cod));
  }

  crearHabilidad(dto: CrearItemCatalogoDto): Promise<HabilidadDestreza> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, HABILIDADES_DESTREZAS, dto));
  }

  actualizarHabilidad(cod: string, dto: ActualizarItemCatalogoDto): Promise<HabilidadDestreza> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, HABILIDADES_DESTREZAS, cod, dto));
  }

  eliminarHabilidad(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, HABILIDADES_DESTREZAS, cod));
  }

  crearConocimiento(dto: CrearItemCatalogoDto): Promise<CnoConocimiento> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, CONOCIMIENTOS_CNO, dto));
  }

  actualizarConocimiento(cod: string, dto: ActualizarItemCatalogoDto): Promise<CnoConocimiento> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, CONOCIMIENTOS_CNO, cod, dto));
  }

  eliminarConocimiento(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, CONOCIMIENTOS_CNO, cod));
  }

  async findAllDenominaciones(pagination: PaginationDto): Promise<PageResponse<CnoDenominacion>> {
    const [data, total] = await this.denominacionRepo.findAndCount({
      order: { codDenominacionCno: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }
}
