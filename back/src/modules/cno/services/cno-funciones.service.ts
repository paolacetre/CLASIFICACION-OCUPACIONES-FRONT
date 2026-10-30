import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { CnoFuncion, CnoOcupacion, CnoRegFunciones } from '../entities';
import { CreateCnoFuncionDto } from '../dto/create-cno-funcion.dto';
import { UpdateCnoFuncionDto } from '../dto/update-cno-funcion.dto';
import { CreateCnoRegFuncionesChildDto } from '../dto/create-cno-ocupacion.dto';
import { ConsultarCnoFuncionesDto, CnoFuncionResultado } from '../dto/consultar-cno-funciones.dto';
import { siguienteConsecutivo } from '../utils/cno-secuencia.util';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { condicionTexto } from '../../../common/utils/busqueda-texto.util';

/**
 * Dueño exclusivo del catálogo maestro `cno_funcion` y de la creación de
 * vínculos `cno_reg_funciones`. `CnoOcupacionService` delega aquí en lugar de
 * manipular estas entidades directamente.
 */
@Injectable()
export class CnoFuncionesService {
  constructor(
    @InjectRepository(CnoFuncion)
    private readonly funcionRepo: Repository<CnoFuncion>,

    @InjectRepository(CnoRegFunciones)
    private readonly regFuncionesRepo: Repository<CnoRegFunciones>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(pagination: PaginationDto): Promise<PageResponse<CnoFuncion>> {
    const [data, total] = await this.funcionRepo.findAndCount({
      order: { codFuncion: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  async obtenerOpciones(): Promise<{ codigo: string; nombre: string }[]> {
    return this.funcionRepo
      .createQueryBuilder('f')
      .select(['f.codFuncion AS codigo', 'f.descFuncionCno AS nombre'])
      .where('f.descFuncionCno IS NOT NULL')
      .orderBy('f.codFuncion', 'ASC')
      .getRawMany<{ codigo: string; nombre: string }>();
  }

  /** Columnas reales detrás de cada campo ordenable de la pestaña Funciones. */
  private static readonly COLUMNAS_ORDEN: Record<string, string> = {
    descripcion: 'f.desc_funcion_cno',
    ocupacion: 'o.nomb_ocupacion_cno',
    estado: 'f.estado',
  };

  /**
   * Consulta de la pestaña "Funciones" de la pantalla CNO: texto + filtros
   * (heredados de la ocupación dueña) + orden + paginación resueltos en la
   * base de datos. Opera sobre `cno_reg_funciones` (el vínculo
   * ocupación-función), no sobre el catálogo maestro `cno_funcion`.
   */
  async consultar({
    q,
    nivel,
    area,
    estado,
    codOcupacion,
    page,
    limit,
    orden,
    direccion,
  }: ConsultarCnoFuncionesDto): Promise<PageResponse<CnoFuncionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.regFuncionesRepo
      .createQueryBuilder('f')
      .innerJoin('f.ocupacion', 'o')
      .addSelect(['o.codOcupacionCno', 'o.nombOcupacionCno'])
      .leftJoin('o.nivelCualificacion', 'nivel')
      .leftJoin('o.areaDesempeno', 'area');

    const texto = condicionTexto(['f.desc_funcion_cno'], termino);
    if (texto) {
      query.andWhere(texto.sql, texto.params);
    }
    if (nivel) {
      query.andWhere('nivel.niveles_cualificacion = :nivel', { nivel });
    }
    if (area) {
      query.andWhere('area.nom_desempeno = :area', { area });
    }
    if (estado) {
      query.andWhere('f.estado = :estado', { estado: estado.toLowerCase() === 'activo' ? 1 : 0 });
    }
    if (codOcupacion) {
      query.andWhere('o.cod_ocupacion_cno = :codOcupacion', { codOcupacion });
    }

    const [rows, total] = await query
      .orderBy(CnoFuncionesService.COLUMNAS_ORDEN[orden], direccion)
      .addOrderBy('f.codigo', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const data: CnoFuncionResultado[] = rows.map((f) => ({
      codigo: f.codigo,
      descFuncionCno: f.descFuncionCno ?? '',
      estado: f.estado === 1 ? 'Activo' : 'Inactivo',
      codOcupacion: f.ocupacion?.codOcupacionCno ?? '',
      nombOcupacion: f.ocupacion?.nombOcupacionCno ?? '',
    }));

    return buildPageResponse(data, total, { page, limit } as PaginationDto);
  }

  async findOne(codFuncion: string): Promise<CnoFuncion> {
    const funcion = await this.funcionRepo.findOne({ where: { codFuncion } });
    if (!funcion) {
      throw new NotFoundException(`Función CNO con código ${codFuncion} no encontrada`);
    }
    return funcion;
  }

  async crear(dto: CreateCnoFuncionDto, manager?: EntityManager): Promise<CnoFuncion> {
    if (manager) {
      return this.crearConManager(dto, manager);
    }
    return this.dataSource.transaction((txManager) => this.crearConManager(dto, txManager));
  }

  private async crearConManager(dto: CreateCnoFuncionDto, manager: EntityManager): Promise<CnoFuncion> {
    const descripcion = dto.descFuncionCno.trim();

    const duplicada = await manager.findOne(CnoFuncion, {
      where: { descFuncionCno: ILike(descripcion) },
    });
    if (duplicada) {
      throw new ConflictException(
        `Ya existe una función en el catálogo con la descripción "${descripcion}" (código ${duplicada.codFuncion})`,
      );
    }

    const codFuncion = await this.generarCodigoCatalogo(manager);
    const funcion = manager.create(CnoFuncion, { codFuncion, descFuncionCno: descripcion });
    return manager.save(CnoFuncion, funcion);
  }

  async actualizar(codFuncion: string, dto: UpdateCnoFuncionDto): Promise<CnoFuncion> {
    const funcion = await this.findOne(codFuncion);
    const descripcion = dto.descFuncionCno.trim();

    const duplicada = await this.funcionRepo.findOne({
      where: { descFuncionCno: ILike(descripcion) },
    });
    if (duplicada && duplicada.codFuncion !== codFuncion) {
      throw new ConflictException(
        `Ya existe una función en el catálogo con la descripción "${descripcion}" (código ${duplicada.codFuncion})`,
      );
    }

    funcion.descFuncionCno = descripcion;
    return this.funcionRepo.save(funcion);
  }

  /** Inactiva el vínculo ocupación-función (cno_reg_funciones.estado), no la función maestra. */
  async inactivarRelacion(codigoRelacion: string): Promise<CnoRegFunciones> {
    const relacion = await this.regFuncionesRepo.findOne({ where: { codigo: codigoRelacion } });
    if (!relacion) {
      throw new NotFoundException(`Relación ocupación-función con código ${codigoRelacion} no encontrada`);
    }
    relacion.estado = 0;
    return this.regFuncionesRepo.save(relacion);
  }

  /** Resuelve una función existente del catálogo o crea una nueva si no viene codFuncion. */
  async resolverFuncion(child: CreateCnoRegFuncionesChildDto, manager: EntityManager): Promise<CnoFuncion> {
    if (child.codFuncion) {
      const funcion = await manager.findOne(CnoFuncion, { where: { codFuncion: child.codFuncion } });
      if (!funcion) {
        throw new NotFoundException(`Función CNO con código ${child.codFuncion} no encontrada`);
      }
      return funcion;
    }
    // El DTO valida esto en el borde HTTP (@ValidateIf en CreateCnoRegFuncionesChildDto);
    // se repite aquí para que este método sea seguro también si se invoca desde
    // otro punto de entrada que no pase por el ValidationPipe.
    if (!child.descFuncionCno) {
      throw new BadRequestException(
        'Debe enviarse codFuncion (función existente) o descFuncionCno (para crear una función nueva).',
      );
    }
    return this.crearConManager({ descFuncionCno: child.descFuncionCno }, manager);
  }

  async generarCodigoCatalogo(manager: EntityManager): Promise<string> {
    const next = await siguienteConsecutivo(
      manager,
      'cno_funcion',
      `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_funcion FROM 'F-(\\d+)') AS INT)), 0) + 1 AS next FROM cno_funcion`,
      [],
    );
    return `F-${String(next).padStart(3, '0')}`;
  }

  async generarCodigoRelacion(codOcupacion: string, manager: EntityManager): Promise<string> {
    const next = await siguienteConsecutivo(
      manager,
      `cno_reg_funciones:${codOcupacion}`,
      `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM '\\.(\\d+)$') AS INT)), 0) + 1 AS next
       FROM cno_reg_funciones WHERE cno_ocupacion = $1`,
      [codOcupacion],
    );
    return `F-${codOcupacion}.${String(next).padStart(3, '0')}`;
  }

  /** Resuelve/crea la función y crea el vínculo cno_reg_funciones para la ocupación dada. */
  async vincularAOcupacion(
    codOcupacion: string,
    child: CreateCnoRegFuncionesChildDto,
    manager: EntityManager,
  ): Promise<CnoRegFunciones> {
    const funcion = await this.resolverFuncion(child, manager);
    const codigo = await this.generarCodigoRelacion(codOcupacion, manager);

    const relacion = manager.create(CnoRegFunciones, {
      codigo,
      descFuncionCno: child.descFuncionCno?.trim() || funcion.descFuncionCno,
      estado: child.estado ?? 1,
      ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
      funcion: { codFuncion: funcion.codFuncion } as CnoFuncion,
    });
    return manager.save(CnoRegFunciones, relacion);
  }
}
