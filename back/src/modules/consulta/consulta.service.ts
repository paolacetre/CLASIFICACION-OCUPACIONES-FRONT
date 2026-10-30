import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CnoBulkUploadService } from '../cno/services/cno-bulk-upload.service';
import { CuocBulkUploadService } from '../cuoc/services/cuoc-bulk-upload.service';
import { CnoOcupacionService } from '../cno/services/cno-ocupacion.service';
import { CuocOcupacionService } from '../cuoc/services/cuoc-ocupacion.service';
import { CorrelativaService } from '../correlativa/services/correlativa.service';
import { CorrelativaCargaService } from '../correlativa/services/correlativa-carga.service';
import { BuscarOcupacionDto } from '../../common/dto/buscar-ocupacion.dto';
import { DataSource } from 'typeorm';
import { condicionTexto } from '../../common/utils/busqueda-texto.util';
import {
  CodigoNombreDto,
  FichaOcupacionDto,
  ResultadoBuscadorDto,
  TipoClasificacion,
} from '../cno/entities/consulta-publica.dto';

/** Tablas de denominaciones por clasificación, para el buscador público. */
const TABLA_DENOMINACIONES: Record<TipoClasificacion, { tabla: string; ocupacion: string; codigo: string; nombre: string }> = {
  CNO: { tabla: 'cno_denominacion', ocupacion: 'cno_cod_ocupacion', codigo: 'cod_denominacion_cno', nombre: 'desc_denominacion' },
  CUOC: { tabla: 'cuoc_denominacion', ocupacion: 'cod_ocupacion_cuoc', codigo: 'cod_denominacion', nombre: 'nom_denominacion' },
};

/** Orden natural por código: "F-99" antes que "F-100", "2" antes que "10". */
const porCodigo = (a: { codigo: string }, b: { codigo: string }) =>
  a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
const porNombre = (a: { nombre: string | null }, b: { nombre: string | null }) =>
  (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es');

/** estado smallint de denominaciones/funciones: 1 activa, 0 inactiva; sin dato se toma como activa. */
const esActivo = (estado: unknown) => estado === null || estado === undefined || Number(estado) === 1;

export interface ConsultaOcupacionResult {
  tipo: 'CNO' | 'CUOC';
  codigo: string;
  nombre: string;
  descripcion: string | null;
  estado: boolean | null;
  fechaRegistro: string | null;
  fechaInactivacion: string | null;
  trazabilidad: string | null;

  areaDesempeno: { codigo: string; nombre: string; descripcion: string | null } | null;
  nivelCualificacion: { codigo: string; nombre: string; descripcion: string | null } | null;
  /** Campo ocupacional CNO (cno_ocupacion.campo_ocup_cno); CUOC no lo tiene. Solo lo ven usuarios APE (CampoOcupacionalInterceptor). */
  campoOcupCno: string | null;
  /** Descripción del campo ocupacional (cno_ocupacion.desc_campo_ocup_cno). Misma restricción APE. */
  descCampoOcupCno: string | null;

  /** `activo`: estado 1 (o sin estado). La ficha pública solo muestra las activas. */
  funciones: { codigo: string; descripcion: string; activo: boolean }[];
  denominaciones: { codigo: string; nombre: string; activo: boolean }[];
  habilidades: { codigo: string; nombre: string }[];
  conocimientos: { codigo: string; nombre: string }[];
  ocupacionesRelacionadas: { codigo: string; nombre: string }[];

  /** Ocupación(es) equivalente(s) en la otra clasificación (CNO->CUOC o CUOC->CNO), desde `correlativa_ocupacion`. */
  correlativa: { codigo: string; nombre: string | null }[];

  /**
   * Normas técnicas/legales asociadas a la ocupación. Siempre vacío: el proyecto
   * no tiene ninguna tabla ni entidad que modele "normas" (se revisó todo el
   * esquema de cno/cuoc/correlativa). Si esta información existe en algún lado,
   * hay que confirmar la fuente antes de poder llenarlo.
   */
  normasAsociadas: string[];
}

export interface CargaExcelResult {
  message: string;
  tipoDetectado: 'CNO' | 'CUOC';
  totalInserted: number;
  totalSkipped: number;
  totalErrors: number;
  detalles: string[];
}

@Injectable()
export class ConsultaService {
  private readonly logger = new Logger(ConsultaService.name);

  constructor(
    private readonly cnoBulkUploadService: CnoBulkUploadService,
    private readonly cuocBulkUploadService: CuocBulkUploadService,
    private readonly cnoOcupacionService: CnoOcupacionService,
    private readonly cuocOcupacionService: CuocOcupacionService,
    private readonly correlativaService: CorrelativaService,
    private readonly correlativaCargaService: CorrelativaCargaService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Buscador del sitio externo: cada ocupación CNO que coincide, con las
   * denominaciones que se listan debajo de ella en la tabla de resultados.
   * Solo CNO: las CUOC equivalentes no son resultados del buscador, se ven en
   * la «Correlativa CUOC» de la ficha de cada ocupación CNO.
   */
  async buscarPublico(dto: BuscarOcupacionDto): Promise<ResultadoBuscadorDto[]> {
    const ocupaciones = await this.cnoOcupacionService.buscar(dto, { porDenominacion: true });
    if (ocupaciones.length === 0) return [];

    const denominaciones = await this.denominacionesPublicas(
      'CNO',
      ocupaciones.map((o) => o.codigo),
      dto.q ?? '',
    );

    return ocupaciones.map((o) => ({
      tipo: 'CNO' as const,
      codigo: o.codigo,
      nombre: o.nombre,
      denominaciones: denominaciones.get(o.codigo) ?? [],
    }));
  }

  /**
   * Denominaciones activas de las ocupaciones dadas, agrupadas por ocupación.
   * Si alguna denominación de una ocupación contiene las palabras buscadas se
   * devuelven solo esas; si la ocupación coincidió por código o nombre, todas.
   */
  private async denominacionesPublicas(
    tipo: TipoClasificacion,
    codigos: string[],
    termino: string,
  ): Promise<Map<string, CodigoNombreDto[]>> {
    const porOcupacion = new Map<string, CodigoNombreDto[]>();
    if (codigos.length === 0) return porOcupacion;

    const t = TABLA_DENOMINACIONES[tipo];
    const coincide = condicionTexto([`d.${t.nombre}`], termino);
    const filas: { ocupacion: string; codigo: string; nombre: string; coincide: boolean }[] = await this.dataSource
      .createQueryBuilder()
      .select(`d.${t.ocupacion}`, 'ocupacion')
      .addSelect(`d.${t.codigo}`, 'codigo')
      .addSelect(`d.${t.nombre}`, 'nombre')
      .addSelect(coincide ? coincide.sql : 'false', 'coincide')
      .from(t.tabla, 'd')
      .where(`d.${t.ocupacion} IN (:...codigos)`, { codigos })
      .andWhere('d.estado = 1')
      .andWhere(`COALESCE(TRIM(d.${t.nombre}), '') <> ''`)
      .setParameters(coincide?.params ?? {})
      .getRawMany();

    const todas = new Map<string, typeof filas>();
    for (const fila of filas) {
      todas.set(fila.ocupacion, [...(todas.get(fila.ocupacion) ?? []), fila]);
    }
    for (const [ocupacion, lista] of todas) {
      const coincidentes = lista.filter((f) => f.coincide);
      porOcupacion.set(
        ocupacion,
        (coincidentes.length > 0 ? coincidentes : lista)
          .map((f) => ({ codigo: f.codigo, nombre: f.nombre }))
          .sort(porNombre),
      );
    }
    return porOcupacion;
  }

  /**
   * Ficha de la ocupación CNO para el sitio externo, en el orden de la pantalla.
   * Un código CUOC no tiene ficha pública: se llega a las CUOC por la
   * «Correlativa CUOC» de la ficha de su CNO.
   */
  async fichaPublica(codigo: string): Promise<FichaOcupacionDto> {
    if (this.detectarTipoPorCodigo(codigo) === 'CUOC') {
      throw new NotFoundException(`Ocupación CNO ${codigo} no encontrada`);
    }
    const o = await this.buscarPorCodigo(codigo);
    const codigoNombre = (x: { codigo: string; nombre: string | null } | null): CodigoNombreDto | null =>
      x ? { codigo: x.codigo, nombre: x.nombre || null } : null;
    const conNombre = (lista: { codigo: string; nombre: string | null }[]) =>
      lista.filter((x) => x.nombre?.trim()).map((x) => ({ codigo: x.codigo, nombre: x.nombre }));

    return {
      tipo: o.tipo,
      codigo: o.codigo,
      nombre: o.nombre,
      descripcion: o.descripcion,
      ubicacion: {
        areaDesempeno: codigoNombre(o.areaDesempeno),
        nivelCualificacion: codigoNombre(o.nivelCualificacion),
        // El campo ocupacional (o.campoOcupCno y su descripción) no se publica:
        // es exclusivo de usuarios APE.
      },
      // Solo lo vigente: las inactivas (380 denominaciones y 52 funciones CNO
      // al 29-09-2026) salían en la ficha aunque el buscador ya las ocultaba.
      funciones: o.funciones
        .filter((f) => f.activo && f.descripcion?.trim())
        .sort(porCodigo)
        .map((f, i) => ({ numero: String(i + 1).padStart(2, '0'), codigo: f.codigo, descripcion: f.descripcion })),
      normasAsociadas: o.normasAsociadas,
      denominaciones: conNombre(o.denominaciones.filter((d) => d.activo)).sort(porNombre),
      ocupacionesRelacionadas: conNombre(o.ocupacionesRelacionadas).sort(porNombre),
      habilidades: conNombre(o.habilidades).sort(porCodigo),
      conocimientos: conNombre(o.conocimientos).sort(porCodigo),
      correlativa: {
        tipo: o.tipo === 'CNO' ? 'CUOC' : 'CNO',
        // Por nombre, como las demás listas y como la muestra el sitio externo.
        ocupaciones: o.correlativa.map((c) => ({ codigo: c.codigo, nombre: c.nombre })).sort(porNombre),
      },
    };
  }

  detectarTipoPorCodigo(codigo: string): 'CNO' | 'CUOC' {
    const digits = codigo.replace(/\D/g, '');
    if (digits.length <= 4) return 'CNO';
    return 'CUOC';
  }

  async uploadExcel(buffer: Buffer): Promise<any> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('El archivo no es un Excel válido');
    }

    const sheetNames = workbook.SheetNames;
    this.logger.log(`Pestañas encontradas: ${sheetNames.join(', ')}`);

    // Detectar si es un archivo correlativo CNO-CUOC basado en las pestañas
    const normalizedSheetNames = sheetNames.map(name =>
      name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    const hasPorDenominacion = normalizedSheetNames.some(name => name.includes('por denominacion') || name.includes('pordenominacion'));
    const hasPorOcupacion = normalizedSheetNames.some(name => name.includes('por ocupacion') || name.includes('porocupacion'));

    if (hasPorDenominacion && hasPorOcupacion) {
      this.logger.log('Detectado archivo correlativo CNO-CUOC en consulta. Iniciando procesamiento unificado...');
      const result = await this.correlativaService.processExcel(buffer);
      return {
        message: result.message,
        tipoDetectado: 'CORRELACION',
        totalInserted: result.totalInserted,
        totalSkipped: 0,
        totalErrors: result.totalErrors,
        detalles: [result.message],
      };
    }

    const isCno = sheetNames.some(name =>
      name.toLowerCase().includes('c.n.o') || name.toLowerCase().includes('cno')
    );
    const isCuoc = sheetNames.some(name =>
      name.toLowerCase().includes('cuoc') ||
      name.toLowerCase().includes('jerarqu') ||
      name.toLowerCase().includes('destrezas')
    );

    let tipo: 'CNO' | 'CUOC';
    if (isCno && !isCuoc) {
      tipo = 'CNO';
    } else if (isCuoc && !isCno) {
      tipo = 'CUOC';
    } else {
      const ws = workbook.Sheets[sheetNames[0]];
      if (ws && ws['!ref']) {
        tipo = this.detectarTipoPorContenido(workbook);
      } else {
        tipo = 'CUOC';
      }
    }

    this.logger.log(`Tipo detectado: ${tipo}`);

    let result: any;
    if (tipo === 'CNO') {
      result = await this.cnoBulkUploadService.processExcel(buffer);
    } else {
      result = await this.cuocBulkUploadService.processExcel(buffer);
    }

    return {
      message: result.message,
      tipoDetectado: tipo,
      totalInserted: result.totalInserted,
      totalSkipped: result.totalSkipped,
      totalErrors: result.totalErrors,
      detalles: result.sheets?.map((s: any) => s.message) || [],
    };
  }

  async buscarPorCodigo(codigo: string): Promise<ConsultaOcupacionResult> {
    const tipo = this.detectarTipoPorCodigo(codigo);

    if (tipo === 'CNO') {
      return this.buscarCno(codigo);
    }
    return this.buscarCuoc(codigo);
  }

  private async buscarCno(codigo: string): Promise<ConsultaOcupacionResult> {
    const ocupacion = await this.cnoOcupacionService.findOne(codigo);
    const correlativaOcupaciones = await this.correlativaCargaService.listarOcupaciones({ cno: codigo });

    return {
      tipo: 'CNO',
      codigo: ocupacion.codOcupacionCno,
      nombre: ocupacion.nombOcupacionCno || '',
      descripcion: ocupacion.descripcion,
      estado: ocupacion.estado,
      fechaRegistro: ocupacion.fechaRegistro?.toISOString() || null,
      fechaInactivacion: ocupacion.fechaInactivacion?.toISOString() || null,
      trazabilidad: ocupacion.trazabilidad,
      areaDesempeno: ocupacion.areaDesempeno
        ? {
            codigo: ocupacion.areaDesempeno.codDesempeno,
            nombre: ocupacion.areaDesempeno.nomDesempeno || '',
            descripcion: ocupacion.areaDesempeno.descripcion,
          }
        : null,
      nivelCualificacion: ocupacion.nivelCualificacion
        ? {
            codigo: ocupacion.nivelCualificacion.codCualificacion,
            nombre: ocupacion.nivelCualificacion.nivelesCualificacion || '',
            descripcion: ocupacion.nivelCualificacion.descripcion,
          }
        : null,
      campoOcupCno: ocupacion.campoOcupCno?.trim() || null,
      descCampoOcupCno: ocupacion.descCampoOcupCno?.trim() || null,
      funciones: (ocupacion.funciones || []).map((f: any) => ({
        codigo: f.funcion?.codFuncion || '',
        descripcion: f.descFuncionCno || f.funcion?.descFuncionCno || '',
        activo: esActivo(f.estado),
      })),
      denominaciones: (ocupacion.denominaciones || []).map((d: any) => ({
        codigo: d.codDenominacionCno || '',
        nombre: d.descDenominacion || '',
        activo: esActivo(d.estado),
      })),
      habilidades: (ocupacion.habilidades || []).map((h: any) => ({
        codigo: h.habilidadDestreza?.codHabDest?.toString() || '',
        nombre: h.nombHabDest || h.habilidadDestreza?.nombHabDest || '',
      })),
      conocimientos: (ocupacion.conocimientos || []).map((c: any) => ({
        codigo: c.conocimiento?.codConocimiento?.toString() || '',
        nombre: c.nombConocimiento || c.conocimiento?.nombConocimiento || '',
      })),
      ocupacionesRelacionadas: (ocupacion.relacionadas || []).map((r: any) => ({
        codigo: r.codigoOcupacion || '',
        // nombre_ocupacion es el de la ocupación de origen; el de la relacionada
        // está en nombre_cno_relacionada.
        nombre: r.nombreCnoRelacionada || '',
      })),
      correlativa: correlativaOcupaciones.map((r) => ({
        codigo: r.codOcupacionCuoc,
        nombre: r.nombOcupacionCuoc,
      })),
      normasAsociadas: [],
    };
  }

  private async buscarCuoc(codigo: string): Promise<ConsultaOcupacionResult> {
    const ocupacion = await this.cuocOcupacionService.findOne(codigo);
    const correlativaOcupaciones = await this.correlativaCargaService.listarOcupaciones({ cuoc: codigo });

    return {
      tipo: 'CUOC',
      codigo: ocupacion.codOcupacionCuoc,
      nombre: ocupacion.nomOcupacionCuoc || '',
      descripcion: ocupacion.descOcupacionCuoc,
      estado: ocupacion.estado,
      fechaRegistro: ocupacion.fechaRegistro?.toISOString() || null,
      fechaInactivacion: ocupacion.fechaInactivacion?.toISOString() || null,
      trazabilidad: ocupacion.trazabilidad,
      areaDesempeno: ocupacion.areaCualificacion
        ? {
            codigo: ocupacion.areaCualificacion.codigo,
            nombre: ocupacion.areaCualificacion.descripcion || '',
            descripcion: ocupacion.areaCualificacion.descripcion,
          }
        : null,
      nivelCualificacion: ocupacion.nivelCompetencia
        ? {
            codigo: ocupacion.nivelCompetencia.codNivel?.toString(),
            nombre: ocupacion.nivelCompetencia.nombreNivel || '',
            descripcion: null,
          }
        : null,
      campoOcupCno: null,
      descCampoOcupCno: null,
      // CuocOcupacionService.findOne llena estas listas con SQL crudo y alias
      // ya planos (codigo/nombre/descripcion); conocimientos y destrezas
      // viajan en `conocimientos` y `habilidades`, no en las relaciones de la
      // entidad. Leer los nombres de la entidad dejaba todo en "".
      funciones: (ocupacion.funciones || []).map((f: any) => ({
        codigo: f.codigo?.toString() || '',
        descripcion: f.descripcion || '',
        activo: esActivo(f.estado),
      })),
      denominaciones: (ocupacion.denominaciones || []).map((d: any) => ({
        codigo: d.codigo || d.codDenominacion || '',
        nombre: d.nombre || '',
        activo: esActivo(d.estado),
      })),
      habilidades: ((ocupacion as any).habilidades || []).map((h: any) => ({
        codigo: h.codigo?.toString() || '',
        nombre: h.nombre || '',
      })),
      conocimientos: ((ocupacion as any).conocimientos || []).map((c: any) => ({
        codigo: c.codigo?.toString() || '',
        nombre: c.nombre || '',
      })),
      ocupacionesRelacionadas: (ocupacion.ocupacionesAfines || []).map((a: any) => ({
        codigo: a.codigo || '',
        nombre: a.nombre || '',
      })),
      correlativa: correlativaOcupaciones.map((r) => ({
        codigo: r.codOcupacionCno,
        nombre: r.nombOcupacionCno,
      })),
      normasAsociadas: [],
    };
  }

  private detectarTipoPorContenido(workbook: XLSX.WorkBook): 'CNO' | 'CUOC' {
    const sheetNames = workbook.SheetNames;
    for (const name of sheetNames) {
      const ws = workbook.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      for (const row of rows) {
        for (const val of Object.values(row)) {
          if (val != null && val !== '') {
            const str = String(val).replace(/\D/g, '');
            if (str.length >= 4) {
              const num = parseInt(str, 10);
              if (!isNaN(num)) {
                if (num >= 10000 && str.length === 5) return 'CUOC';
                if (num < 10000 && str.length === 4) return 'CNO';
              }
            }
          }
        }
      }
    }
    return 'CUOC';
  }
}
