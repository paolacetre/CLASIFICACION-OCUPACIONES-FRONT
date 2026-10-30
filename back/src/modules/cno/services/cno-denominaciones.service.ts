import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { CnoDenominacion, CnoOcupacion } from '../entities';
import { UpdateCnoDenominacionDto } from '../dto/update-cno-denominacion.dto';
import {
  ConsultarCnoDenominacionesDto,
  CnoDenominacionResultado,
} from '../dto/consultar-cno-denominaciones.dto';
import { siguienteConsecutivo } from '../utils/cno-secuencia.util';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { condicionTexto } from '../../../common/utils/busqueda-texto.util';

/**
 * Forma mínima que necesita `crear()`. Tanto `CreateCnoDenominacionDto`
 * (endpoint standalone) como `CreateCnoRegDenominacionChildDto` (hijo dentro
 * de CreateCnoOcupacionDto) cumplen esta forma por estructura — se usa una
 * interfaz propia en lugar de una unión de esos dos DTOs para que este
 * servicio no dependa de la forma exacta de DTOs que no le pertenecen.
 */
export interface DenominacionInput {
  descDenominacion: string;
  estado?: number;
}

/**
 * Dueño exclusivo de `cno_denominacion`. Cada denominación pertenece a una
 * única ocupación (no hay catálogo compartido entre ocupaciones), por lo que
 * "crear" siempre implica generar el código D-{codOcupacion}.NNN.
 */
@Injectable()
export class CnoDenominacionesService {
  constructor(
    @InjectRepository(CnoDenominacion)
    private readonly denominacionRepo: Repository<CnoDenominacion>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(pagination: PaginationDto): Promise<PageResponse<CnoDenominacion>> {
    const [data, total] = await this.denominacionRepo.findAndCount({
      relations: ['ocupacion'],
      order: { codDenominacionCno: 'ASC' },
      skip: pagination.skip,
      take: pagination.limit,
    });
    return buildPageResponse(data, total, pagination);
  }

  /** Columnas reales detrás de cada campo ordenable de la pestaña Denominaciones. */
  private static readonly COLUMNAS_ORDEN: Record<string, string> = {
    descripcion: 'd.desc_denominacion',
    ocupacion: 'o.nomb_ocupacion_cno',
    estado: 'd.estado',
  };

  /**
   * Consulta de la pestaña "Denominaciones" de la pantalla CNO: texto +
   * filtros (heredados de la ocupación dueña) + orden + paginación resueltos
   * en la base de datos. Mismo patrón que `CnoOcupacionService.consultar()`.
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
  }: ConsultarCnoDenominacionesDto): Promise<PageResponse<CnoDenominacionResultado>> {
    const termino = (q ?? '').trim();

    const query = this.denominacionRepo
      .createQueryBuilder('d')
      .innerJoin('d.ocupacion', 'o')
      .addSelect(['o.codOcupacionCno', 'o.nombOcupacionCno'])
      .leftJoin('o.nivelCualificacion', 'nivel')
      .leftJoin('o.areaDesempeno', 'area');

    const texto = condicionTexto(['d.desc_denominacion'], termino);
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
      query.andWhere('d.estado = :estado', { estado: estado.toLowerCase() === 'activo' ? 1 : 0 });
    }
    if (codOcupacion) {
      query.andWhere('o.cod_ocupacion_cno = :codOcupacion', { codOcupacion });
    }

    const [rows, total] = await query
      .orderBy(CnoDenominacionesService.COLUMNAS_ORDEN[orden], direccion)
      .addOrderBy('d.cod_denominacion_cno', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const data: CnoDenominacionResultado[] = rows.map((d) => ({
      codigo: d.codigo,
      codDenominacionCno: d.codDenominacionCno,
      descDenominacion: d.descDenominacion ?? '',
      estado: d.estado === 1 ? 'Activo' : 'Inactivo',
      codOcupacion: d.ocupacion?.codOcupacionCno ?? '',
      nombOcupacion: d.ocupacion?.nombOcupacionCno ?? '',
    }));

    return buildPageResponse(data, total, { page, limit } as PaginationDto);
  }

  findByOcupacion(codOcupacion: string): Promise<CnoDenominacion[]> {
    return this.denominacionRepo.find({
      where: { ocupacion: { codOcupacionCno: codOcupacion } },
      relations: ['ocupacion'],
      order: { codDenominacionCno: 'ASC' },
    });
  }

  async findOne(codigo: number): Promise<CnoDenominacion> {
    const denominacion = await this.denominacionRepo.findOne({ where: { codigo }, relations: ['ocupacion'] });
    if (!denominacion) {
      throw new NotFoundException(`Denominación CNO con código ${codigo} no encontrada`);
    }
    return denominacion;
  }

  async crear(codOcupacion: string, dto: DenominacionInput, manager?: EntityManager): Promise<CnoDenominacion> {
    if (manager) {
      return this.crearConManager(codOcupacion, dto, manager);
    }
    return this.dataSource.transaction((txManager) => this.crearConManager(codOcupacion, dto, txManager));
  }

  private async crearConManager(
    codOcupacion: string,
    dto: DenominacionInput,
    manager: EntityManager,
  ): Promise<CnoDenominacion> {
    const descripcion = dto.descDenominacion.trim();

    // Se consulta con el mismo manager: al crear la ocupación completa, esta
    // todavía no está confirmada y solo es visible dentro de su transacción.
    const existeOcupacion = await manager.exists(CnoOcupacion, { where: { codOcupacionCno: codOcupacion } });
    if (!existeOcupacion) {
      throw new NotFoundException(`La ocupación CNO ${codOcupacion} no existe`);
    }

    const duplicada = await manager.findOne(CnoDenominacion, {
      where: {
        ocupacion: { codOcupacionCno: codOcupacion },
        descDenominacion: ILike(descripcion),
        estado: 1,
      },
    });
    if (duplicada) {
      throw new ConflictException(
        `Ya existe una denominación activa "${descripcion}" para la ocupación ${codOcupacion} (código ${duplicada.codDenominacionCno})`,
      );
    }

    const codDenominacionCno = await this.generarCodigo(codOcupacion, manager);
    const denominacion = manager.create(CnoDenominacion, {
      codDenominacionCno,
      descDenominacion: descripcion,
      estado: dto.estado ?? 1,
      fechaReg: new Date(),
      ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
    });
    return manager.save(CnoDenominacion, denominacion);
  }

  async actualizar(codigo: number, dto: UpdateCnoDenominacionDto): Promise<CnoDenominacion> {
    const denominacion = await this.findOne(codigo);

    if (dto.descDenominacion !== undefined) {
      denominacion.descDenominacion = dto.descDenominacion.trim();
    }
    if (dto.estado !== undefined) {
      denominacion.estado = dto.estado;
    }
    return this.denominacionRepo.save(denominacion);
  }

  async inactivar(codigo: number): Promise<CnoDenominacion> {
    const denominacion = await this.findOne(codigo);
    denominacion.estado = 0;
    denominacion.fechaInactivacion = new Date();
    return this.denominacionRepo.save(denominacion);
  }

  async generarCodigo(codOcupacion: string, manager: EntityManager): Promise<string> {
    const next = await siguienteConsecutivo(
      manager,
      `cno_denominacion:${codOcupacion}`,
      `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_denominacion_cno FROM '\\.(\\d+)$') AS INT)), 0) + 1 AS next
       FROM cno_denominacion WHERE cno_cod_ocupacion = $1`,
      [codOcupacion],
    );
    return `D-${codOcupacion}.${String(next).padStart(3, '0')}`;
  }
}
