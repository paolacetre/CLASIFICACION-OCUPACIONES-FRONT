import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActualizarNivelCopiaDto, CrearNivelCopiaDto, CrearNivelDto } from '../../../common/dto/nivel-copia.dto';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import {
  CatalogoSimple,
  actualizarItemCatalogo,
  crearItemCatalogo,
  eliminarItemCatalogo,
} from '../../../common/utils/catalogo-simple.util';
import { resincronizarSecuencia, siguienteConsecutivo } from '../../cno/utils/cno-secuencia.util';
import { HABILIDADES_DESTREZAS } from '../../shared/habilidades-destrezas.catalogo';
import {
  CuocFuncion,
  CuocDenominacion,
  CuocAreaCualificacion,
  CuocRegConocimiento,
  CuocDestreza,
  CuocOcupacion,
  CuocConocimiento,
  CuocNivelCompetencia,
} from '../entities';
import { HabilidadDestreza } from '../../shared/entities';
import {
  CreateCuocFuncionDto,
  CreateCuocDenominacionDto,
  CreateCuocRegConocimientoDto,
  CreateCuocDestrezaDto,
  RegistrarDestrezaOcupacionDto,
} from '../dto/create-cuoc-hijos.dto';
import {
  UpdateCuocFuncionDto,
  UpdateCuocDenominacionDto,
  UpdateCuocRegConocimientoDto,
  UpdateCuocDestrezaDto,
} from '../dto/update-cuoc-hijos.dto';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { condicionTexto } from '../../../common/utils/busqueda-texto.util';
import { ConsultarCuocDenominacionesDto, CuocDenominacionResultado } from '../dto/consultar-cuoc-denominaciones.dto';
import { ConsultarCuocFuncionesDto, CuocFuncionResultado } from '../dto/consultar-cuoc-funciones.dto';

/** En las áreas CUOC el nombre se guarda en la columna `descripcion`. */
const AREAS_CUALIFICACION: CatalogoSimple<CuocAreaCualificacion> = {
  entidad: CuocAreaCualificacion,
  tabla: 'cuoc_area_cualificacion',
  colCodigo: 'codigo',
  colNombre: 'descripcion',
  codigo: 'texto',
  etiqueta: 'un área de cualificación',
  nombresCopiados: [],
  usos: [{ tabla: 'cuoc_ocupacion', colCodigo: 'codigo_area_cuoc', descripcion: 'ocupación(es) CUOC' }],
};

const CONOCIMIENTOS_CUOC: CatalogoSimple<CuocConocimiento> = {
  entidad: CuocConocimiento,
  tabla: 'cuoc_conocimiento',
  colCodigo: 'cod_conocimiento',
  colNombre: 'nomb_conocimiento',
  colDescripcion: 'desc_conocimiento',
  codigo: 'entero',
  etiqueta: 'un conocimiento CUOC',
  nombresCopiados: [
    { tabla: 'cuoc_reg_conocimientos', colCodigo: 'cod_conocimiento', colNombre: 'nomb_conocimiento' },
    { tabla: 'correlativa_conocimiento', colCodigo: 'cod_conocimiento_cuoc', colNombre: 'nomb_conocimiento_cuoc' },
  ],
  usos: [
    { tabla: 'cuoc_reg_conocimientos', colCodigo: 'cod_conocimiento', descripcion: 'ocupación(es) CUOC' },
    { tabla: 'correlativa_conocimiento', colCodigo: 'cod_conocimiento_cuoc', descripcion: 'correlativa(s)' },
  ],
};

@Injectable()
export class CuocHijosService {
  constructor(
    @InjectRepository(CuocFuncion)
    private readonly funcionRepo: Repository<CuocFuncion>,

    @InjectRepository(CuocDenominacion)
    private readonly denominacionRepo: Repository<CuocDenominacion>,

    @InjectRepository(CuocAreaCualificacion)
    private readonly areaRepo: Repository<CuocAreaCualificacion>,

    @InjectRepository(CuocRegConocimiento)
    private readonly regConocimientoRepo: Repository<CuocRegConocimiento>,

    @InjectRepository(CuocDestreza)
    private readonly destrezaRepo: Repository<CuocDestreza>,

    @InjectRepository(CuocNivelCompetencia)
    private readonly nivelRepo: Repository<CuocNivelCompetencia>,

    @InjectRepository(CuocConocimiento)
    private readonly conocRepo: Repository<CuocConocimiento>,

    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════
  //  ÁREAS DE CUALIFICACIÓN (catálogo)
  // ═══════════════════════════════════════════════

  async findAllAreasCualificacion(pagination: PaginationDto): Promise<PageResponse<CuocAreaCualificacion>> {
    const [data, total] = await this.areaRepo.findAndCount({
      order: { codigo: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  async findOneAreaCualificacion(codigo: string): Promise<CuocAreaCualificacion> {
    const area = await this.areaRepo.findOne({ where: { codigo } });
    if (!area) throw new NotFoundException(`Área de cualificación con código ${codigo} no encontrada`);
    return area;
  }

  // Actualización edita siempre el catálogo OFICIAL de áreas, destrezas y conocimientos.

  crearArea(dto: CrearItemCatalogoDto): Promise<CuocAreaCualificacion> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, AREAS_CUALIFICACION, dto));
  }

  actualizarArea(cod: string, dto: ActualizarItemCatalogoDto): Promise<CuocAreaCualificacion> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, AREAS_CUALIFICACION, cod, dto));
  }

  eliminarArea(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, AREAS_CUALIFICACION, cod));
  }

  /**
   * ID que recibirá la próxima destreza: el mismo cálculo que hace
   * `crearItemCatalogo` al guardar (MAX + 1 sobre TODA habilidad_destreza,
   * incluidas las habilidades solo CNO que el catálogo CUOC no lista).
   */
  async siguienteIdDestreza(): Promise<{ siguienteId: number }> {
    const [{ siguiente }] = await this.dataSource.query(
      'SELECT COALESCE(MAX(cod_hab_dest), 0) + 1 AS siguiente FROM clasificacion.habilidad_destreza',
    );
    return { siguienteId: Number(siguiente) };
  }

  crearDestrezaCatalogo(dto: CrearItemCatalogoDto): Promise<HabilidadDestreza> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, HABILIDADES_DESTREZAS, dto));
  }

  actualizarDestrezaCatalogo(cod: string, dto: ActualizarItemCatalogoDto): Promise<HabilidadDestreza> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, HABILIDADES_DESTREZAS, cod, dto));
  }

  eliminarDestrezaCatalogo(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, HABILIDADES_DESTREZAS, cod));
  }

  crearConocimientoCatalogo(dto: CrearItemCatalogoDto): Promise<CuocConocimiento> {
    return this.dataSource.transaction((m) => crearItemCatalogo(m, CONOCIMIENTOS_CUOC, dto));
  }

  actualizarConocimientoCatalogo(cod: string, dto: ActualizarItemCatalogoDto): Promise<CuocConocimiento> {
    return this.dataSource.transaction((m) => actualizarItemCatalogo(m, CONOCIMIENTOS_CUOC, cod, dto));
  }

  eliminarConocimientoCatalogo(cod: string): Promise<{ message: string }> {
    return this.dataSource.transaction((m) => eliminarItemCatalogo(m, CONOCIMIENTOS_CUOC, cod));
  }

  /** Por defecto solo el catálogo oficial; con incluirCopias suma las copias de Análisis (al final). */
  async findAllNivelesCompetencia(incluirCopias = false): Promise<CuocNivelCompetencia[]> {
    return this.nivelRepo.find({
      where: incluirCopias ? {} : { esCopia: false },
      order: { esCopia: 'ASC', codNivel: 'ASC' },
    });
  }

  // ── Niveles ──────────────────────────────────────────────────────────────
  // Igual que CNO: Actualización edita el catálogo OFICIAL; Análisis crea
  // copias (es_copia) numeradas desde 1001 para no mezclarse con los oficiales.

  private static readonly PRIMER_CODIGO_COPIA = 1001;

  async crearNivel(dto: CrearNivelDto): Promise<CuocNivelCompetencia> {
    return this.dataSource.transaction(async (manager) => {
      const codNivel = Number(dto.codigo);
      if (!Number.isInteger(codNivel) || codNivel < 1 || codNivel >= CuocHijosService.PRIMER_CODIGO_COPIA) {
        throw new BadRequestException(
          `El código de un nivel CUOC es un número entre 1 y ${CuocHijosService.PRIMER_CODIGO_COPIA - 1} (desde ${CuocHijosService.PRIMER_CODIGO_COPIA} son copias de Análisis).`,
        );
      }
      if (await manager.findOne(CuocNivelCompetencia, { where: { codNivel } })) {
        throw new ConflictException(`Ya existe un nivel con el código ${codNivel}.`);
      }
      const nombre = dto.nombre.trim();
      await this.exigirNombreNivelLibre(manager, nombre, null);
      return manager.save(
        CuocNivelCompetencia,
        manager.create(CuocNivelCompetencia, {
          codNivel,
          nombreNivel: nombre,
          descripcion: dto.descripcion?.trim() || null,
          esCopia: false,
        }),
      );
    });
  }

  async crearCopiaNivel(dto: CrearNivelCopiaDto): Promise<CuocNivelCompetencia> {
    return this.dataSource.transaction(async (manager) => {
      let codOriginal: number | null = null;
      if (dto.codOriginal?.trim()) {
        codOriginal = Number(dto.codOriginal);
        const original = Number.isInteger(codOriginal)
          ? await manager.findOne(CuocNivelCompetencia, { where: { codNivel: codOriginal } })
          : null;
        if (!original) throw new NotFoundException(`No existe el nivel ${dto.codOriginal}.`);
        if (original.esCopia) {
          throw new BadRequestException('Ese nivel ya es una copia: edítalo directamente en lugar de copiarlo.');
        }
      }

      const nombre = dto.nombre.trim();
      await this.exigirNombreNivelLibre(manager, nombre, null);

      const codNivel = await siguienteConsecutivo(
        manager,
        'cuoc_nivel_copia',
        `SELECT GREATEST(COALESCE(MAX(cod_nivel), 0) + 1, $1) AS next FROM cuoc_nivel_competencia WHERE es_copia`,
        [CuocHijosService.PRIMER_CODIGO_COPIA],
      );

      const copia = manager.create(CuocNivelCompetencia, {
        codNivel,
        nombreNivel: nombre,
        descripcion: dto.descripcion?.trim() || null,
        esCopia: true,
        codOriginal,
        creadoEn: new Date(),
      });
      return manager.save(CuocNivelCompetencia, copia);
    });
  }

  /** Edita cualquier nivel (oficial o copia). El código no cambia. */
  async actualizarNivel(cod: number, dto: ActualizarNivelCopiaDto): Promise<CuocNivelCompetencia> {
    return this.dataSource.transaction(async (manager) => {
      const nivel = await this.buscarNivel(manager, cod);

      if (dto.nombre !== undefined) {
        const nombre = dto.nombre.trim();
        await this.exigirNombreNivelLibre(manager, nombre, nivel.codNivel);
        nivel.nombreNivel = nombre;
        // Las ocupaciones guardan también el nombre del nivel como texto.
        await manager.query('UPDATE cuoc_ocupacion SET nombre_nivel = $1 WHERE cod_nivel_cuoc = $2', [nombre, nivel.codNivel]);
      }
      if (dto.descripcion !== undefined) nivel.descripcion = dto.descripcion.trim() || null;
      return manager.save(CuocNivelCompetencia, nivel);
    });
  }

  /** Elimina un nivel solo si ninguna ocupación (oficial o de Análisis) lo usa. */
  async eliminarNivel(cod: number): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const nivel = await this.buscarNivel(manager, cod);
      const [{ usos }] = await manager.query(
        'SELECT count(*)::int AS usos FROM cuoc_ocupacion WHERE cod_nivel_cuoc = $1',
        [nivel.codNivel],
      );
      if (usos > 0) {
        throw new ConflictException(`No se puede eliminar: ${usos} ocupación(es) usan el nivel "${nivel.nombreNivel}".`);
      }
      await manager.delete(CuocNivelCompetencia, { codNivel: nivel.codNivel });
      return { message: `Nivel ${nivel.codNivel} eliminado.` };
    });
  }

  private async buscarNivel(manager: EntityManager, cod: number): Promise<CuocNivelCompetencia> {
    const nivel = await manager.findOne(CuocNivelCompetencia, { where: { codNivel: cod } });
    if (!nivel) throw new NotFoundException(`No existe el nivel ${cod}.`);
    return nivel;
  }

  /** Análisis identifica el nivel por su nombre: dos niveles con el mismo nombre serían indistinguibles. */
  private async exigirNombreNivelLibre(manager: EntityManager, nombre: string, excepto: number | null): Promise<void> {
    const [{ existe }] = await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM cuoc_nivel_competencia
         WHERE lower(trim(nombre_nivel)) = lower($1) AND ($2::int IS NULL OR cod_nivel <> $2)
       ) AS existe`,
      [nombre, excepto],
    );
    if (existe) {
      throw new ConflictException(
        `Ya existe un nivel llamado "${nombre}". Usa un nombre distinto: Análisis identifica los niveles por su nombre.`,
      );
    }
  }

  async findAllConocimientoCatalogo(): Promise<CuocConocimiento[]> {
    return this.conocRepo.find({ order: { codConocimiento: 'ASC' } });
  }

  // ═══════════════════════════════════════════════
  //  FUNCIONES
  // ═══════════════════════════════════════════════

  async findAllFunciones(pagination: PaginationDto): Promise<PageResponse<CuocFuncion>> {
    const [data, total] = await this.funcionRepo.findAndCount({
      relations: ['ocupacion'],
      order: { codigo: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  /** Columnas reales detrás de cada campo ordenable de la pestaña Funciones CUOC. */
  private static readonly COLUMNAS_ORDEN_FUNC: Record<string, string> = {
    descripcion: 'f.nom_funcion_cuoc',
    ocupacion: 'o.nom_ocupacion_cuoc',
    estado: 'f.estado',
  };

  /**
   * Consulta de la pestaña "Funciones" de la pantalla CUOC: texto + filtros
   * (heredados de la ocupación dueña) + orden + paginación resueltos en la
   * base de datos. Mismo patrón que `CuocOcupacionService.consultar()`.
   */
  async consultarFunciones({
    q,
    nivel,
    area,
    estado,
    codOcupacion,
    page,
    limit,
    orden,
    direccion,
  }: ConsultarCuocFuncionesDto): Promise<PageResponse<CuocFuncionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.funcionRepo
      .createQueryBuilder('f')
      .innerJoin('f.ocupacion', 'o')
      .addSelect(['o.codOcupacionCuoc', 'o.nomOcupacionCuoc'])
      .leftJoin('o.nivelCompetencia', 'nivel')
      .leftJoin('o.areaCualificacion', 'area');

    const texto = condicionTexto(['f.nom_funcion_cuoc'], termino);
    if (texto) {
      query.andWhere(texto.sql, texto.params);
    }
    if (nivel) {
      query.andWhere('nivel.nombre_nivel = :nivel', { nivel });
    }
    if (area) {
      query.andWhere('area.descripcion = :area', { area });
    }
    if (estado) {
      query.andWhere('f.estado = :estado', { estado: estado.toLowerCase() === 'activo' ? 1 : 0 });
    }
    if (codOcupacion) {
      query.andWhere('o.cod_ocupacion_cuoc = :codOcupacion', { codOcupacion });
    }

    const [rows, total] = await query
      .orderBy(CuocHijosService.COLUMNAS_ORDEN_FUNC[orden], direccion)
      .addOrderBy('f.codigo', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const data: CuocFuncionResultado[] = rows.map((f) => ({
      codigo: f.codigo,
      nomFuncionCuoc: f.nomFuncionCuoc ?? '',
      estado: f.estado === 1 ? 'Activo' : 'Inactivo',
      codOcupacion: f.ocupacion?.codOcupacionCuoc ?? '',
      nombOcupacion: f.ocupacion?.nomOcupacionCuoc ?? '',
    }));

    return buildPageResponse(data, total, { page, limit } as PaginationDto);
  }

  async obtenerOpcionesFunciones(): Promise<{ codigo: string; nombre: string }[]> {
    return this.dataSource.query(
      `SELECT DISTINCT ON (lower(f.nom_funcion_cuoc))
              f.cod_funcion_cuoc AS codigo,
              f.nom_funcion_cuoc AS nombre
         FROM clasificacion.cuoc_funciones f
        WHERE f.nom_funcion_cuoc IS NOT NULL AND trim(f.nom_funcion_cuoc) <> ''
        ORDER BY lower(f.nom_funcion_cuoc), f.cod_funcion_cuoc ASC`,
    );
  }

  async findFuncionesByOcupacion(codOcupacion: string): Promise<CuocFuncion[]> {
    return this.funcionRepo.find({
      where: { ocupacion: { codOcupacionCuoc: codOcupacion } },
      relations: ['ocupacion'],
      order: { codigo: 'ASC' },
    });
  }

  async findOneFuncion(codigo: number): Promise<CuocFuncion> {
    const funcion = await this.funcionRepo.findOne({
      where: { codigo },
      relations: ['ocupacion'],
    });
    if (!funcion) throw new NotFoundException(`Función CUOC con código ${codigo} no encontrada`);
    return funcion;
  }

  /**
   * Los hijos se guardan con la FK a la ocupación: sin comprobarla antes, un
   * código inexistente llegaba a Postgres y volvía como 500 en vez de 404.
   */
  private async exigirOcupacion(codOcupacionCuoc: string): Promise<void> {
    const existe = await this.dataSource.manager.exists(CuocOcupacion, { where: { codOcupacionCuoc } });
    if (!existe) {
      throw new NotFoundException(`La ocupación CUOC ${codOcupacionCuoc} no existe`);
    }
  }

  async createFuncion(dto: CreateCuocFuncionDto): Promise<CuocFuncion> {
    await this.exigirOcupacion(dto.codOcupacionCuoc);
    const funcion = this.funcionRepo.create({
      codFuncionCuoc: dto.codFuncionCuoc,
      nomFuncionCuoc: dto.nomFuncionCuoc,
      ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
    });
    return this.funcionRepo.save(funcion);
  }

  async updateFuncion(codigo: number, dto: UpdateCuocFuncionDto): Promise<CuocFuncion> {
    const funcion = await this.findOneFuncion(codigo);
    if (dto.codFuncionCuoc !== undefined) funcion.codFuncionCuoc = dto.codFuncionCuoc;
    if (dto.nomFuncionCuoc !== undefined) funcion.nomFuncionCuoc = dto.nomFuncionCuoc;
    if (dto.codOcupacionCuoc !== undefined) {
      await this.exigirOcupacion(dto.codOcupacionCuoc);
      funcion.ocupacion = { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion;
    }
    return this.funcionRepo.save(funcion);
  }

  async removeFuncion(codigo: number): Promise<{ message: string }> {
    const funcion = await this.findOneFuncion(codigo);
    await this.funcionRepo.remove(funcion);
    return { message: `Función CUOC ${codigo} eliminada correctamente` };
  }

  // ═══════════════════════════════════════════════
  //  DENOMINACIONES
  // ═══════════════════════════════════════════════

  async findAllDenominaciones(pagination: PaginationDto): Promise<PageResponse<CuocDenominacion>> {
    const [data, total] = await this.denominacionRepo.findAndCount({
      relations: ['ocupacion'],
      order: { codDenominacion: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  /** Columnas reales detrás de cada campo ordenable de la pestaña Denominaciones CUOC. */
  private static readonly COLUMNAS_ORDEN_DENOM: Record<string, string> = {
    descripcion: 'd.nom_denominacion',
    ocupacion: 'o.nom_ocupacion_cuoc',
    estado: 'd.estado',
  };

  /**
   * Consulta de la pestaña "Denominaciones" de la pantalla CUOC: texto +
   * filtros (heredados de la ocupación dueña) + orden + paginación resueltos
   * en la base de datos.
   */
  async consultarDenominaciones({
    q,
    nivel,
    area,
    estado,
    codOcupacion,
    page,
    limit,
    orden,
    direccion,
  }: ConsultarCuocDenominacionesDto): Promise<PageResponse<CuocDenominacionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.denominacionRepo
      .createQueryBuilder('d')
      .innerJoin('d.ocupacion', 'o')
      .addSelect(['o.codOcupacionCuoc', 'o.nomOcupacionCuoc'])
      .leftJoin('o.nivelCompetencia', 'nivel')
      .leftJoin('o.areaCualificacion', 'area');

    const texto = condicionTexto(['d.nom_denominacion'], termino);
    if (texto) {
      query.andWhere(texto.sql, texto.params);
    }
    if (nivel) {
      query.andWhere('nivel.nombre_nivel = :nivel', { nivel });
    }
    if (area) {
      query.andWhere('area.descripcion = :area', { area });
    }
    if (estado) {
      query.andWhere('d.estado = :estado', { estado: estado.toLowerCase() === 'activo' ? 1 : 0 });
    }
    if (codOcupacion) {
      query.andWhere('o.cod_ocupacion_cuoc = :codOcupacion', { codOcupacion });
    }

    const [rows, total] = await query
      .orderBy(CuocHijosService.COLUMNAS_ORDEN_DENOM[orden], direccion)
      .addOrderBy('d.cod_denominacion', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const data: CuocDenominacionResultado[] = rows.map((d) => ({
      codigo: d.codigo,
      codDenominacion: d.codDenominacion,
      nomDenominacion: d.nomDenominacion ?? '',
      estado: d.estado === 1 ? 'Activo' : 'Inactivo',
      codOcupacion: d.ocupacion?.codOcupacionCuoc ?? '',
      nombOcupacion: d.ocupacion?.nomOcupacionCuoc ?? '',
    }));

    return buildPageResponse(data, total, { page, limit } as PaginationDto);
  }

  async findDenominacionesByOcupacion(codOcupacion: string): Promise<CuocDenominacion[]> {
    return this.denominacionRepo.find({
      where: { ocupacion: { codOcupacionCuoc: codOcupacion } },
      relations: ['ocupacion'],
      order: { codDenominacion: 'ASC' },
    });
  }

  async findOneDenominacion(cod: string): Promise<CuocDenominacion> {
    const denom = await this.denominacionRepo.findOne({
      where: { codDenominacion: cod },
      relations: ['ocupacion'],
    });
    if (!denom) throw new NotFoundException(`Denominación CUOC con código ${cod} no encontrada`);
    return denom;
  }

  async createDenominacion(dto: CreateCuocDenominacionDto): Promise<CuocDenominacion> {
    await this.exigirOcupacion(dto.codOcupacionCuoc);
    const denom = this.denominacionRepo.create({
      codDenominacion: dto.codDenominacion,
      nomDenominacion: dto.nomDenominacion,
      fuenteDenom: dto.fuenteDenom,
      observacion: dto.observacion,
      ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
    });
    return this.denominacionRepo.save(denom);
  }

  async updateDenominacion(cod: string, dto: UpdateCuocDenominacionDto): Promise<CuocDenominacion> {
    const denom = await this.findOneDenominacion(cod);
    if (dto.nomDenominacion !== undefined) denom.nomDenominacion = dto.nomDenominacion;
    if (dto.fuenteDenom !== undefined) denom.fuenteDenom = dto.fuenteDenom;
    if (dto.observacion !== undefined) denom.observacion = dto.observacion;
    if (dto.codOcupacionCuoc !== undefined) {
      await this.exigirOcupacion(dto.codOcupacionCuoc);
      denom.ocupacion = { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion;
    }
    return this.denominacionRepo.save(denom);
  }

  async removeDenominacion(cod: string): Promise<{ message: string }> {
    const denom = await this.findOneDenominacion(cod);
    await this.denominacionRepo.remove(denom);
    return { message: `Denominación CUOC ${cod} eliminada correctamente` };
  }

  // ═══════════════════════════════════════════════
  //  CONOCIMIENTOS (reg_conocimientos)
  // ═══════════════════════════════════════════════

  async findAllRegConocimientos(pagination: PaginationDto): Promise<PageResponse<CuocRegConocimiento>> {
    const [data, total] = await this.regConocimientoRepo.findAndCount({
      relations: ['ocupacion', 'conocimiento'],
      order: { codigo: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  async findRegConocimientosByOcupacion(codOcupacion: string): Promise<CuocRegConocimiento[]> {
    return this.regConocimientoRepo.find({
      where: { ocupacion: { codOcupacionCuoc: codOcupacion } },
      relations: ['ocupacion', 'conocimiento'],
    });
  }

  async findOneRegConocimiento(codigo: number): Promise<CuocRegConocimiento> {
    const item = await this.regConocimientoRepo.findOne({
      where: { codigo },
      relations: ['ocupacion', 'conocimiento'],
    });
    if (!item) throw new NotFoundException(`Reg. conocimiento ${codigo} no encontrado`);
    return item;
  }

  async createRegConocimiento(dto: CreateCuocRegConocimientoDto): Promise<CuocRegConocimiento> {
    await this.exigirOcupacion(dto.codOcupacionCuoc);
    const conoc = await this.regConocimientoRepo.manager.findOne(CuocConocimiento, {
      where: { codConocimiento: dto.codConocimiento },
    });
    if (!conoc) throw new NotFoundException(`El conocimiento CUOC ${dto.codConocimiento} no existe`);
    const item = this.regConocimientoRepo.create({
      ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
      conocimiento: { codConocimiento: dto.codConocimiento } as CuocConocimiento,
      nombConocimiento: conoc?.nombConocimiento ?? null,
    });
    return this.regConocimientoRepo.save(item);
  }

  async updateRegConocimiento(codigo: number, dto: UpdateCuocRegConocimientoDto): Promise<CuocRegConocimiento> {
    const item = await this.findOneRegConocimiento(codigo);
    if (dto.codOcupacionCuoc !== undefined) {
      await this.exigirOcupacion(dto.codOcupacionCuoc);
      item.ocupacion = { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion;
    }
    if (dto.codConocimiento !== undefined) {
      item.conocimiento = { codConocimiento: dto.codConocimiento } as CuocConocimiento;
      const conoc = await this.regConocimientoRepo.manager.findOne(CuocConocimiento, {
        where: { codConocimiento: dto.codConocimiento },
      });
      if (!conoc) throw new NotFoundException(`El conocimiento CUOC ${dto.codConocimiento} no existe`);
      item.nombConocimiento = conoc.nombConocimiento ?? null;
    }
    return this.regConocimientoRepo.save(item);
  }

  async removeRegConocimiento(codigo: number): Promise<{ message: string }> {
    const item = await this.findOneRegConocimiento(codigo);
    await this.regConocimientoRepo.remove(item);
    return { message: `Reg. conocimiento ${codigo} eliminado correctamente` };
  }

  // ═══════════════════════════════════════════════
  //  DESTREZAS
  // ═══════════════════════════════════════════════

  /**
   * Las destrezas de CUOC: las que usa alguna ocupación CUOC y las que aún no
   * usa nadie (recién creadas). Se excluyen las que solo usa CNO (habilidades).
   */
  async findAllDestrezasCatalogo(): Promise<HabilidadDestreza[]> {
    return this.destrezaRepo.manager
      .createQueryBuilder(HabilidadDestreza, 'h')
      .where(
        `(EXISTS (SELECT 1 FROM clasificacion.cuoc_destreza d WHERE d.codigo_destreza = h.cod_hab_dest)
          OR NOT EXISTS (SELECT 1 FROM clasificacion.cno_reg_habilidad r WHERE r.codigo_habilidad = h.cod_hab_dest))`,
      )
      .orderBy('h.nombHabDest', 'ASC')
      .getMany();
  }

  async findAllDestrezas(pagination: PaginationDto): Promise<PageResponse<CuocDestreza>> {
    const [data, total] = await this.destrezaRepo.findAndCount({
      relations: ['ocupacion', 'habilidadDestreza'],
      order: { codDestrezasCuoc: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  async findDestrezasByOcupacion(codOcupacion: string): Promise<CuocDestreza[]> {
    return this.destrezaRepo.find({
      where: { ocupacion: { codOcupacionCuoc: codOcupacion } },
      relations: ['ocupacion', 'habilidadDestreza'],
    });
  }

  async findOneDestreza(codDestrezasCuoc: number): Promise<CuocDestreza> {
    const item = await this.destrezaRepo.findOne({
      where: { codDestrezasCuoc },
      relations: ['ocupacion', 'habilidadDestreza'],
    });
    if (!item) throw new NotFoundException(`Destreza CUOC con código ${codDestrezasCuoc} no encontrada`);
    return item;
  }

  /**
   * «Agregar destreza» con la estructura de la hoja «Destrezas» de la plantilla
   * CUOC: vincula la destreza (ID + nombre) a la ocupación, igual que la carga.
   * Todo o nada, en una transacción:
   *  - ID que ya existe en habilidad_destreza: se usa ese ítem. Si el nombre
   *    escrito no coincide se rechaza, para no vincular una destreza distinta
   *    de la que el usuario cree.
   *  - ID nuevo: se crea en el catálogo con ese ID y nombre (el nombre no
   *    puede repetirse: Análisis identifica las destrezas por nombre).
   *  - Si la ocupación ya tiene esa destreza, se rechaza.
   */
  async registrarDestrezaOcupacion(dto: RegistrarDestrezaOcupacionDto): Promise<{
    codOcupacionCuoc: string;
    nomOcupacionCuoc: string | null;
    codHabDest: number;
    nombHabDest: string;
    creadaEnCatalogo: boolean;
  }> {
    const nombre = dto.nombre.trim();
    return this.dataSource.transaction(async (m) => {
      const [ocupacion] = await m.query(
        'SELECT cod_ocupacion_cuoc AS cod, nom_ocupacion_cuoc AS nombre FROM clasificacion.cuoc_ocupacion WHERE cod_ocupacion_cuoc = $1',
        [dto.codOcupacionCuoc],
      );
      if (!ocupacion) throw new NotFoundException(`La ocupación CUOC ${dto.codOcupacionCuoc} no existe.`);

      const [existente] = await m.query(
        'SELECT cod_hab_dest AS cod, nomb_hab_dest AS nombre FROM clasificacion.habilidad_destreza WHERE cod_hab_dest = $1',
        [dto.codHabDest],
      );

      let nombreFinal: string;
      let creada = false;
      if (existente) {
        nombreFinal = existente.nombre ?? nombre;
        if ((existente.nombre ?? '').trim().toLowerCase() !== nombre.toLowerCase()) {
          throw new ConflictException(
            `El ID ${dto.codHabDest} ya es la destreza «${existente.nombre}». Usa ese nombre o un ID nuevo.`,
          );
        }
      } else {
        const [{ repetido }] = await m.query(
          'SELECT EXISTS (SELECT 1 FROM clasificacion.habilidad_destreza WHERE lower(trim(nomb_hab_dest)) = lower($1)) AS repetido',
          [nombre],
        );
        if (repetido) {
          throw new ConflictException(`Ya existe una destreza llamada «${nombre}» con otro ID. Usa ese ID.`);
        }
        await m.query('INSERT INTO clasificacion.habilidad_destreza (cod_hab_dest, nomb_hab_dest) VALUES ($1, $2)', [
          dto.codHabDest,
          nombre,
        ]);
        await resincronizarSecuencia(m, 'habilidad_destreza', 'cod_hab_dest');
        nombreFinal = nombre;
        creada = true;
      }

      const [{ vinculada }] = await m.query(
        'SELECT EXISTS (SELECT 1 FROM clasificacion.cuoc_destreza WHERE cod_ocupacion_cuoc = $1 AND codigo_destreza = $2) AS vinculada',
        [dto.codOcupacionCuoc, dto.codHabDest],
      );
      if (vinculada) {
        throw new ConflictException(`La ocupación ${dto.codOcupacionCuoc} ya tiene la destreza ${dto.codHabDest}.`);
      }
      await m.query(
        'INSERT INTO clasificacion.cuoc_destreza (codigo_destreza, cod_ocupacion_cuoc, nomb_hab_dest) VALUES ($1, $2, $3)',
        [dto.codHabDest, dto.codOcupacionCuoc, nombreFinal],
      );

      return {
        codOcupacionCuoc: ocupacion.cod,
        nomOcupacionCuoc: ocupacion.nombre,
        codHabDest: dto.codHabDest,
        nombHabDest: nombreFinal,
        creadaEnCatalogo: creada,
      };
    });
  }

  async createDestreza(dto: CreateCuocDestrezaDto): Promise<CuocDestreza> {
    await this.exigirOcupacion(dto.codOcupacionCuoc);
    const hab = await this.destrezaRepo.manager.findOne(HabilidadDestreza, {
      where: { codHabDest: dto.codHabDest },
    });
    if (!hab) throw new NotFoundException(`La destreza ${dto.codHabDest} no existe`);
    const item = this.destrezaRepo.create({
      ocupacion: { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion,
      habilidadDestreza: { codHabDest: dto.codHabDest } as HabilidadDestreza,
      nombHabDest: hab?.nombHabDest ?? null,
    });
    return this.destrezaRepo.save(item);
  }

  async updateDestreza(codDestrezasCuoc: number, dto: UpdateCuocDestrezaDto): Promise<CuocDestreza> {
    const item = await this.findOneDestreza(codDestrezasCuoc);
    if (dto.codOcupacionCuoc !== undefined) {
      await this.exigirOcupacion(dto.codOcupacionCuoc);
      item.ocupacion = { codOcupacionCuoc: dto.codOcupacionCuoc } as CuocOcupacion;
    }
    if (dto.codHabDest !== undefined) {
      item.habilidadDestreza = { codHabDest: dto.codHabDest } as HabilidadDestreza;
      const hab = await this.destrezaRepo.manager.findOne(HabilidadDestreza, {
        where: { codHabDest: dto.codHabDest },
      });
      if (!hab) throw new NotFoundException(`La destreza ${dto.codHabDest} no existe`);
      item.nombHabDest = hab.nombHabDest ?? null;
    }
    return this.destrezaRepo.save(item);
  }

  async removeDestreza(codDestrezasCuoc: number): Promise<{ message: string }> {
    const item = await this.findOneDestreza(codDestrezasCuoc);
    await this.destrezaRepo.remove(item);
    return { message: `Destreza CUOC ${codDestrezasCuoc} eliminada correctamente` };
  }
}
