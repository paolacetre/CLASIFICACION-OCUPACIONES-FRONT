import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, defer, expand, filter, forkJoin, map, reduce, shareReplay, throwError } from 'rxjs';
import { ApiPage, queryParams, text } from '../../shared/api/http-helpers';
import { FileReview, SheetOutcome, TemplateType, UploadProgress, UploadResult, UploadType } from './carga-cno/carga-cno.model';
import { Classification } from './clasificacion';
import { EditableOccupation } from './editar-ocupacion/editar-ocupacion.model';
import {
  CatalogDraft,
  CatalogItem,
  CatalogKind,
  OccupationDraft,
  PickOption,
  compareCodes,
  hasDescription,
  registrationDate,
  requiresCode
} from './actualizacion-cno.model';
import { normalizeText } from '../../shared/ui/list';

/** El registro ya no existe (el 404 del servidor). */
export const CATALOG_NOT_FOUND = 'CATALOG_NOT_FOUND';
/** Choca con otro registro o está en uso (el 409 del servidor): el mensaje del servidor dice por qué. */
export const CATALOG_CONFLICT = 'CATALOG_CONFLICT';
/** Ya existe una ocupación con ese código (el 409 al registrarla). */
export const OCCUPATION_CODE_TAKEN = 'OCCUPATION_CODE_TAKEN';
/** El servidor no aceptó los datos (el 400 del servidor). */
export const INVALID_CATALOG_ITEM = 'INVALID_CATALOG_ITEM';

/** Error de una escritura, con el mensaje que dio el servidor (p. ej. "No se puede eliminar: 12 ocupación(es) usan el nivel…"). */
export class CatalogError extends Error {
  constructor(code: string, readonly serverMessage: string) {
    super(code);
  }
}

/** Los catálogos y las ocupaciones se piden completos, de a 500 (el máximo que acepta el backend). */
const PAGE_LIMIT = 500;

/**
 * Dónde vive cada catálogo y cómo se llaman sus campos en el backend. `paged`: responde
 * `{ data, total… }` y acepta `page`/`limit`; si no, responde la lista completa y no admite
 * parámetros (el backend rechaza los que no espera). `description: null`: el catálogo no tiene.
 */
interface CatalogEndpoint {
  path: string;
  paged: boolean;
  code: string;
  name: string;
  description: string | null;
}

const ENDPOINTS: Record<Classification, Record<CatalogKind, CatalogEndpoint>> = {
  cno: {
    level: { path: '/api/cno/catalogos/niveles-cualificacion', paged: true, code: 'codCualificacion', name: 'nivelesCualificacion', description: 'descripcion' },
    area: { path: '/api/cno/catalogos/areas-desempeno', paged: true, code: 'codDesempeno', name: 'nomDesempeno', description: 'descripcion' },
    skill: { path: '/api/cno/catalogos/habilidades', paged: true, code: 'codHabDest', name: 'nombHabDest', description: 'descHabDest' },
    knowledge: { path: '/api/cno/catalogos/conocimientos', paged: true, code: 'codConocimiento', name: 'nombConocimiento', description: 'descConocimiento' }
  },
  cuoc: {
    level: { path: '/api/cuoc/niveles-competencia', paged: false, code: 'codNivel', name: 'nombreNivel', description: 'descripcion' },
    area: { path: '/api/cuoc/areas-cualificacion', paged: true, code: 'codigo', name: 'descripcion', description: null },
    skill: { path: '/api/cuoc/destrezas/catalogo', paged: false, code: 'codHabDest', name: 'nombHabDest', description: 'descHabDest' },
    knowledge: { path: '/api/cuoc/conocimientos/catalogo', paged: false, code: 'codConocimiento', name: 'nombConocimiento', description: 'descConocimiento' }
  }
};

/** Dónde están las ocupaciones de cada clasificación y cómo se llaman sus campos. */
const OCCUPATION_FIELDS: Record<Classification, { path: string; code: string; name: string; description: string }> = {
  cno: { path: '/api/cno/ocupaciones', code: 'codOcupacionCno', name: 'nombOcupacionCno', description: 'descripcion' },
  cuoc: { path: '/api/cuoc/ocupaciones', code: 'codOcupacionCuoc', name: 'nomOcupacionCuoc', description: 'descOcupacionCuoc' }
};

/** Catálogo de funciones para el asistente. En CUOC se usa la consulta (más liviana) y se quitan los textos repetidos. */
const FUNCTION_SOURCE: Record<Classification, { path: string; code: string; label: string }> = {
  cno: { path: '/api/cno/catalogos/funciones', code: 'codFuncion', label: 'descFuncionCno' },
  cuoc: { path: '/api/cuoc/funciones/consulta', code: 'codigo', label: 'nomFuncionCuoc' }
};

function toItem(endpoint: CatalogEndpoint, row: Record<string, unknown>): CatalogItem {
  return {
    code: text(row[endpoint.code]),
    name: text(row[endpoint.name]),
    description: endpoint.description ? text(row[endpoint.description]) : '',
    registeredAt: registrationDate(row['creadoEn']),
    active: true
  };
}

/** Cuerpo de `POST /api/cno/ocupaciones`, igual al que arma la versión desplegada. */
function toCnoOccupationBody(draft: OccupationDraft): Record<string, unknown> {
  return {
    codOcupacionCno: draft.code.trim(),
    nombOcupacionCno: draft.name.trim(),
    descripcion: draft.description.trim(),
    estado: draft.active,
    ...(draft.active ? {} : { fechaInactivacion: draft.registeredOn }),
    fechaRegistro: draft.registeredOn,
    trazabilidad: draft.traceability.trim(),
    codDesempeno: draft.areaCode,
    codCualificacion: draft.levelCode,
    denominaciones: draft.denominations.map((text) => ({ descDenominacion: text })),
    funciones: draft.functions.map((item) => (item.code ? { codFuncion: item.code } : { descFuncionCno: item.text })),
    habilidades: draft.skills.map((item) => ({ codHabilidad: Number(item.code) })),
    conocimientos: draft.knowledge.map((item) => ({ codConocimiento: Number(item.code) })),
    relacionadas: draft.related.map((item) => ({ codigoOcupacion: item.code, nombreCnoRelacionada: item.label }))
  };
}

/**
 * Cuerpo de `POST /api/cuoc/ocupaciones`, como el de la versión desplegada. En CUOC cada ocupación
 * tiene su propia copia de cada función, numerada dentro de ella (`codFuncionCuoc` "1", "2"…), y
 * cada denominación lleva el código `<ocupación>.001`, `.002`… con fuente SENA.
 */
function toCuocOccupationBody(draft: OccupationDraft, levelName: string): Record<string, unknown> {
  const code = draft.code.trim();
  return {
    codOcupacionCuoc: code,
    nomOcupacionCuoc: draft.name.trim(),
    descOcupacionCuoc: draft.description.trim(),
    estado: draft.active,
    ...(draft.active ? {} : { fechaInactivacion: draft.registeredOn }),
    fechaRegistro: draft.registeredOn,
    trazabilidad: draft.traceability.trim(),
    codigoAreaCuoc: draft.areaCode,
    codNivel: Number(draft.levelCode),
    nombreNivel: levelName || `Nivel ${draft.levelCode}`,
    denominaciones: draft.denominations.map((text, index) => ({
      codDenominacion: `${code}.${String(index + 1).padStart(3, '0')}`,
      nomDenominacion: text,
      fuenteDenom: 'SENA'
    })),
    funciones: draft.functions.map((item, index) => ({ codFuncionCuoc: String(index + 1), nomFuncionCuoc: item.text })),
    destrezas: draft.skills.map((item) => ({ codHabDest: Number(item.code) })),
    regConocimientos: draft.knowledge.map((item) => ({ codConocimiento: Number(item.code) }))
  };
}

// ---------- Ocupación completa para editar (`GET /api/{cno|cuoc}/ocupaciones/:cod`) ----------

type Dto = Record<string, unknown>;

const rows = (value: unknown): Dto[] => (Array.isArray(value) ? (value as Dto[]) : []);
const field = (value: unknown, name: string): unknown => (value && typeof value === 'object' ? (value as Dto)[name] : undefined);

let rowKey = 0;
/** Clave única de una fila del editor (para el `trackBy`); no viaja al backend. */
export function nextRowKey(): number {
  return ++rowKey;
}

/** Estado de una denominación o función: 1 activa, 0 inactiva; `null` si no viene. */
function rowActive(value: unknown): boolean | null {
  return value === undefined || value === null ? null : Number(value) !== 0;
}

function toEditableCno(dto: Dto): EditableOccupation {
  return {
    code: text(dto['codOcupacionCno']),
    name: text(dto['nombOcupacionCno']),
    description: text(dto['descripcion']),
    areaCode: text(field(dto['areaDesempeno'], 'codDesempeno')),
    levelCode: text(field(dto['nivelCualificacion'], 'codCualificacion')),
    active: dto['estado'] !== false,
    registeredAt: registrationDate(dto['fechaRegistro']),
    inactiveAt: registrationDate(dto['fechaInactivacion']),
    previousCode: text(dto['codAnteOcupacionCno']),
    traceability: text(dto['trazabilidad']),
    primaryGroup: '',
    denominations: rows(dto['denominaciones']).map((row) => ({
      key: nextRowKey(),
      code: text(row['codDenominacionCno']),
      text: text(row['descDenominacion']),
      active: rowActive(row['estado']),
      registeredAt: registrationDate(row['fechaReg'])
    })),
    functions: rows(dto['funciones']).map((row) => ({
      key: nextRowKey(),
      code: text(row['codigo']),
      text: text(row['descFuncionCno']),
      active: rowActive(row['estado']),
      registeredAt: ''
    })),
    skills: rows(dto['habilidades']).map((row) => ({ code: text(field(row['habilidadDestreza'], 'codHabDest')), label: text(row['nombHabDest']) })),
    knowledge: rows(dto['conocimientos']).map((row) => ({ code: text(field(row['conocimiento'], 'codConocimiento')), label: text(row['nombConocimiento']) })),
    related: rows(dto['relacionadas']).map((row) => ({ code: text(row['codigoOcupacion']), label: text(row['nombreCnoRelacionada'] ?? row['nombreOcupacion']) }))
  };
}

/**
 * `denominations` y `functions`: las listas de `/api/cuoc/{denominaciones|funciones}/ocupacion/:cod`, con
 * estado y fecha. Si no llegan, se usan las de la ocupación completa (sin estado).
 */
function toEditableCuoc(dto: Dto, denominations?: Dto[], functions?: Dto[]): EditableOccupation {
  const group = dto['grupoPrimario'];
  const groupCode = text(field(group, 'codGrupoPrim'));
  const groupName = text(field(group, 'nomGrupoPrim'));
  return {
    code: text(dto['codOcupacionCuoc']),
    name: text(dto['nomOcupacionCuoc']),
    description: text(dto['descOcupacionCuoc']),
    areaCode: text(field(dto['areaCualificacion'], 'codigo')),
    levelCode: text(field(dto['nivelCompetencia'], 'codNivel')),
    active: dto['estado'] !== false,
    registeredAt: registrationDate(dto['fechaRegistro']),
    inactiveAt: registrationDate(dto['fechaInactivacion']),
    previousCode: text(dto['codAnteOcupacionCuoc']),
    traceability: text(dto['trazabilidad']),
    primaryGroup: groupCode ? (groupName ? `${groupCode} · ${groupName}` : groupCode) : '',
    denominations: rows(denominations ?? dto['denominaciones'])
      .map((row) => ({
        key: nextRowKey(),
        code: text(row['codDenominacion'] ?? row['codigo']),
        text: text(row['nomDenominacion'] ?? row['nombre']),
        active: rowActive(row['estado']),
        registeredAt: registrationDate(row['fechaRegistro'])
      }))
      .sort((a, b) => compareCodes(a.code, b.code)),
    functions: rows(functions ?? dto['funciones'])
      .map((row) => ({
        key: nextRowKey(),
        // `codFuncionCuoc` es el que el backend usa para conservar la función al guardar.
        code: text(row['codFuncionCuoc'] ?? row['codigo']),
        text: text(row['nomFuncionCuoc'] ?? row['descripcion']),
        active: rowActive(row['estado']),
        registeredAt: registrationDate(row['fechaRegistro'])
      }))
      .sort((a, b) => compareCodes(a.code, b.code)),
    skills: rows(dto['habilidades']).map((row) => ({ code: text(row['codigo']), label: text(row['nombre']) })),
    knowledge: rows(dto['conocimientos']).map((row) => ({ code: text(row['codigo']), label: text(row['nombre']) })),
    related: rows(dto['ocupacionesAfines']).map((row) => ({ code: text(row['codigo']), label: text(row['nombre'] ?? row['descripcion']) }))
  };
}

/** Informe de `POST /api/{cno|cuoc}/upload/:tipo/validar` (solo lo que usa la vista). */
interface ValidacionDto {
  valid: boolean;
  hoja: string | null;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  columns: { clave: string; name: string; header: string | null; found: boolean; required: boolean }[];
  missingColumns: string[];
  allColumns: { header: string; mapped: boolean; mappedTo: string | null; mappedLabel: string | null }[];
  totalColumnsDetected: number;
  preview: { headers: string[]; rows: string[][] } | null;
  errors: { row: number; field: string; value: string; message: string; suggestion: string }[];
  pareceTipo: UploadType | null;
  message: string;
}

/** Resultado de `POST /api/{cno|cuoc}/upload/:tipo`. */
interface CargaDto {
  message: string;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalUnreadable: number;
  totalErrors: number;
  totalWarnings: number;
  sheets: {
    sheet: string;
    message: string;
    inserted: number;
    updated: number;
    skipped: number;
    unreadable: number;
    errors: string[];
    warnings: string[];
    skippedDetails: string[];
  }[];
}

function toReview(dto: ValidacionDto): FileReview {
  return {
    valid: dto.valid,
    sheet: dto.hoja,
    totalRecords: dto.totalRecords ?? 0,
    validRecords: dto.validRecords ?? 0,
    invalidRecords: dto.invalidRecords ?? 0,
    columns: (dto.columns ?? []).map((column) => ({ key: column.clave, name: column.name, header: column.header, found: column.found, required: column.required })),
    missingColumns: dto.missingColumns ?? [],
    allColumns: (dto.allColumns ?? []).map((column) => ({ header: column.header, mapped: column.mapped, mappedTo: column.mappedTo, mappedLabel: column.mappedLabel })),
    totalColumns: dto.totalColumnsDetected ?? 0,
    preview: dto.preview ?? { headers: [], rows: [] },
    errors: dto.errors ?? [],
    looksLike: dto.pareceTipo ?? null,
    message: text(dto.message)
  };
}

function toResult(dto: CargaDto): UploadResult {
  return {
    message: text(dto.message),
    inserted: dto.totalInserted ?? 0,
    updated: dto.totalUpdated ?? 0,
    skipped: dto.totalSkipped ?? 0,
    unreadable: dto.totalUnreadable ?? 0,
    errors: dto.totalErrors ?? 0,
    warnings: dto.totalWarnings ?? 0,
    sheets: (dto.sheets ?? []).map(
      (sheet): SheetOutcome => ({
        sheet: sheet.sheet,
        message: text(sheet.message),
        inserted: sheet.inserted ?? 0,
        updated: sheet.updated ?? 0,
        skipped: sheet.skipped ?? 0,
        unreadable: sheet.unreadable ?? 0,
        errors: sheet.errors ?? [],
        warnings: sheet.warnings ?? [],
        skippedDetails: sheet.skippedDetails ?? []
      })
    )
  };
}

/** `file` y, si se corrigieron columnas en «Configurar», `mapeoManual` (JSON {encabezado: campo}). */
function uploadForm(file: File, mapping: Record<string, string>): FormData {
  const form = new FormData();
  form.append('file', file, file.name);
  if (Object.keys(mapping).length) {
    form.append('mapeoManual', JSON.stringify(mapping));
  }
  return form;
}

/** Mensaje que dio el servidor al rechazar una petición (vacío si no dio ninguno). */
export function serverErrorText(error: unknown): string {
  return error instanceof HttpErrorResponse ? serverMessage(error) : '';
}

/** El filtro de errores del backend anida el mensaje: `{ message: { message } }`, a veces como lista. */
function serverMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: unknown } | null;
  const nested = (body?.message as { message?: unknown } | undefined)?.message ?? body?.message;
  return Array.isArray(nested) ? nested.join(' ') : typeof nested === 'string' ? nested : '';
}

function toCatalogError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const codes: Record<number, string> = { 400: INVALID_CATALOG_ITEM, 404: CATALOG_NOT_FOUND, 409: CATALOG_CONFLICT };
  return codes[error.status] ? new CatalogError(codes[error.status], serverMessage(error)) : error;
}

/**
 * Catálogos oficiales de la CNO y de la CUOC, contra el backend. Cada método recibe la
 * clasificación al final (por defecto CNO). Lo que se guarda aquí cambia el catálogo oficial
 * (no son copias de Análisis). Borrar un registro que alguna ocupación usa lo rechaza el servidor.
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionCnoService {
  private readonly http = inject(HttpClient);

  /** Respuestas grandes que se reutilizan: ocupaciones y funciones de cada clasificación. */
  private readonly occupationLists = new Map<Classification, Observable<CatalogItem[]>>();
  private readonly functionLists = new Map<Classification, Observable<PickOption[]>>();

  /** Todos los registros de un catálogo (solo el oficial: sin las copias de Análisis), ordenados por código. */
  list(kind: CatalogKind, classification: Classification = 'cno'): Observable<CatalogItem[]> {
    const endpoint = ENDPOINTS[classification][kind];
    const request = endpoint.paged
      ? this.http.get<ApiPage<Record<string, unknown>>>(endpoint.path, { params: queryParams({ page: 1, limit: PAGE_LIMIT }) }).pipe(map((page) => page.data))
      : this.http.get<Record<string, unknown>[]>(endpoint.path);
    return request.pipe(map((rows) => rows.map((row) => toItem(endpoint, row)).sort((a, b) => compareCodes(a.code, b.code))));
  }

  /** `POST`: nivel y área llevan su código; en habilidades/destrezas y conocimientos lo asigna el servidor (el siguiente número). */
  create(kind: CatalogKind, draft: CatalogDraft, classification: Classification = 'cno'): Observable<CatalogItem> {
    const endpoint = ENDPOINTS[classification][kind];
    const body = {
      ...(requiresCode(kind) ? { codigo: draft.code.trim() } : {}),
      nombre: draft.name.trim(),
      ...(hasDescription(classification, kind) ? { descripcion: draft.description.trim() } : {})
    };
    return this.write(endpoint, () => this.http.post<Record<string, unknown>>(endpoint.path, body));
  }

  /** `PATCH /:cod`: nombre y descripción (el código no cambia). */
  update(kind: CatalogKind, code: string, draft: CatalogDraft, classification: Classification = 'cno'): Observable<CatalogItem> {
    const endpoint = ENDPOINTS[classification][kind];
    const body = { nombre: draft.name.trim(), ...(hasDescription(classification, kind) ? { descripcion: draft.description.trim() } : {}) };
    return this.write(endpoint, () => this.http.patch<Record<string, unknown>>(`${endpoint.path}/${encodeURIComponent(code)}`, body));
  }

  /** `DELETE /:cod`: el servidor lo rechaza (409) si alguna ocupación lo usa. */
  remove(kind: CatalogKind, code: string, classification: Classification = 'cno'): Observable<void> {
    const endpoint = ENDPOINTS[classification][kind];
    return defer(() => {
      return this.http.delete(`${endpoint.path}/${encodeURIComponent(code)}`);
    }).pipe(
      catchError((error: unknown) => throwError(() => toCatalogError(error))),
      map(() => undefined)
    );
  }

  /**
   * `GET /api/{cno|cuoc}/ocupaciones` página por página: todas las ocupaciones con su descripción
   * y estado (como la versión desplegada; la consulta paginada no trae la descripción). Sin la
   * "0000", que es de sistema. Es una respuesta grande: se pide una vez y se reutiliza hasta
   * `refreshOccupations()`.
   */
  occupations(classification: Classification = 'cno'): Observable<CatalogItem[]> {
    const cached = this.occupationLists.get(classification);
    if (cached) return cached;
    const fields = OCCUPATION_FIELDS[classification];
    const request = this.pages<Record<string, unknown>>(fields.path).pipe(
      map((rows) =>
        rows
          .filter((row) => text(row[fields.code]) !== '0000')
          .map((row): CatalogItem => ({
            code: text(row[fields.code]),
            name: text(row[fields.name]),
            description: text(row[fields.description]),
            registeredAt: registrationDate(row['fechaRegistro']),
            active: row['estado'] !== false
          }))
          .sort((a, b) => compareCodes(a.code, b.code))
      ),
      catchError((error: unknown) => {
        this.occupationLists.delete(classification);
        return throwError(() => error);
      }),
      shareReplay(1)
    );
    this.occupationLists.set(classification, request);
    return request;
  }

  /**
   * `DELETE /api/{cno|cuoc}/ocupaciones/:cod`: borra la ocupación del catálogo oficial junto con sus
   * funciones, denominaciones, habilidades/destrezas, conocimientos (y en CNO, relacionadas). No se puede deshacer.
   */
  removeOccupation(code: string, classification: Classification = 'cno'): Observable<void> {
    return defer(() => {
      return this.http.delete(`${OCCUPATION_FIELDS[classification].path}/${encodeURIComponent(code)}`);
    }).pipe(
      catchError((error: unknown) => throwError(() => toCatalogError(error))),
      map(() => {
        this.refreshOccupations(classification);
      })
    );
  }

  /**
   * El catálogo de funciones completo, página por página, para elegirlas en el asistente (unas
   * 5000 en CNO; en CUOC, unas 7000 de las que se quitan los textos repetidos). Se pide una vez.
   */
  functions(classification: Classification = 'cno'): Observable<PickOption[]> {
    const cached = this.functionLists.get(classification);
    if (cached) return cached;
    const source = FUNCTION_SOURCE[classification];
    const request = this.pages<Record<string, unknown>>(source.path).pipe(
      map((rows) => {
        const seen = new Set<string>();
        return rows
          .map((row): PickOption => ({ code: text(row[source.code]), label: text(row[source.label]) }))
          .filter((option) => {
            const key = normalizeText(option.label);
            if (classification === 'cno' || !key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      }),
      catchError((error: unknown) => {
        this.functionLists.delete(classification);
        return throwError(() => error);
      }),
      shareReplay(1)
    );
    this.functionLists.set(classification, request);
    return request;
  }

  /**
   * `POST /api/{cno|cuoc}/ocupaciones`: registra la ocupación con sus denominaciones, funciones (las
   * nuevas las crea el servidor), habilidades/destrezas, conocimientos y (en CNO) relacionadas. Un 409
   * es un código repetido; un 400 trae lo que el servidor no aceptó (en `CatalogError.serverMessage`).
   * `levelName` es el nombre del nivel elegido (CUOC lo guarda junto a la ocupación).
   */
  createOccupation(draft: OccupationDraft, classification: Classification = 'cno', levelName = ''): Observable<string> {
    const body = classification === 'cuoc' ? toCuocOccupationBody(draft, levelName) : toCnoOccupationBody(draft);
    const fields = OCCUPATION_FIELDS[classification];
    return defer(() => {
      return this.http.post<Record<string, unknown> | null>(fields.path, body);
    }).pipe(
      catchError((error: unknown) => {
        const translated = toCatalogError(error);
        return throwError(() =>
          translated instanceof CatalogError && translated.message === CATALOG_CONFLICT ? new CatalogError(OCCUPATION_CODE_TAKEN, translated.serverMessage) : translated
        );
      }),
      map((row) => {
        // Las nuevas funciones entran al catálogo y la lista de ocupaciones cambia.
        this.refreshOccupations(classification);
        this.functionLists.delete(classification);
        return text(row?.[fields.code]) || draft.code.trim();
      })
    );
  }

  // ---------- Editar una ocupación ----------

  /** `GET /api/{cno|cuoc}/ocupaciones/:cod`: la ocupación completa, lista para editar. */
  occupationDetail(code: string, classification: Classification = 'cno'): Observable<EditableOccupation> {
    const encoded = encodeURIComponent(code);
    const detail = this.http.get<Dto>(`${OCCUPATION_FIELDS[classification].path}/${encoded}`);
    // En CUOC la ocupación completa no trae el estado ni la fecha de sus denominaciones y funciones:
    // se piden a sus listas propias, que sí los traen (y muestran las que se quitaron, ya inactivas).
    const request =
      classification === 'cuoc'
        ? forkJoin({
            dto: detail,
            denominations: this.http.get<Dto[]>(`/api/cuoc/denominaciones/ocupacion/${encoded}`),
            functions: this.http.get<Dto[]>(`/api/cuoc/funciones/ocupacion/${encoded}`)
          }).pipe(map(({ dto, denominations, functions }) => toEditableCuoc(dto, denominations, functions)))
        : detail.pipe(map(toEditableCno));
    return request.pipe(catchError((error: unknown) => throwError(() => toCatalogError(error))));
  }

  /**
   * `PUT /api/analisis/ocupacion-original`: guarda la edición sobre la ocupación ORIGINAL del catálogo,
   * con el mismo "panel" que usa Análisis (como la versión desplegada). El backend conserva los códigos
   * de las denominaciones y funciones que siguen, crea las nuevas e inactiva las que se quitan; reemplaza
   * habilidades/destrezas, conocimientos y relacionadas. Área y nivel viajan por su nombre.
   */
  saveOccupation(occupation: EditableOccupation, areaName: string, levelName: string, classification: Classification = 'cno'): Observable<string> {
    const named = (items: PickOption[]) => items.map((item) => ({ codigo: item.code, nombre: item.label }));
    const panel = {
      codigo: occupation.code,
      nombre: occupation.name.trim(),
      descripcion: occupation.description.trim(),
      nivelCualificacion: levelName,
      areaDesempeno: areaName,
      estado: occupation.active ? 'Activo' : 'Inactivo',
      trazabilidad: occupation.traceability.trim(),
      funciones: occupation.functions.filter((row) => row.text.trim()).map((row) => ({ codigo: row.code, descripcion: row.text.trim() })),
      denominaciones: occupation.denominations.filter((row) => row.text.trim()).map((row) => ({ codigo: row.code, nombre: row.text.trim() })),
      habilidades: named(occupation.skills),
      conocimientos: named(occupation.knowledge),
      ocupacionesRelacionadas: named(occupation.related)
    };
    return defer(() => {
      return this.http.put<{ codigo?: string }>('/api/analisis/ocupacion-original', { tipo: classification, panel });
    }).pipe(
      catchError((error: unknown) => throwError(() => toCatalogError(error))),
      map((response) => {
        this.refreshOccupations(classification);
        this.functionLists.delete(classification);
        return text(response?.codigo) || occupation.code;
      })
    );
  }

  // ---------- Cargar información desde Excel ----------

  /** `POST /api/{cno|cuoc}/upload/:tipo/validar`: revisa el archivo contra el tipo elegido. No guarda nada. */
  reviewUpload(type: UploadType, file: File, mapping: Record<string, string> = {}, classification: Classification = 'cno'): Observable<FileReview> {
    return this.http.post<ValidacionDto>(`/api/${classification}/upload/${type}/validar`, uploadForm(file, mapping)).pipe(map(toReview));
  }

  /**
   * `POST /api/{cno|cuoc}/upload/:tipo`: carga el archivo en el catálogo oficial. Emite el avance de la
   * subida y, al responder el servidor, el resultado. Después se olvidan las listas guardadas (ocupaciones y funciones).
   */
  upload(type: UploadType, file: File, mapping: Record<string, string> = {}, classification: Classification = 'cno'): Observable<UploadProgress> {
    return defer(() => {
      return this.http.post<CargaDto>(`/api/${classification}/upload/${type}`, uploadForm(file, mapping), { observe: 'events', reportProgress: true });
    }).pipe(
      filter((event: HttpEvent<CargaDto>) => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map((event): UploadProgress => {
        if (event.type === HttpEventType.Response) {
          this.refreshOccupations(classification);
          this.functionLists.delete(classification);
          return { progress: 100, messageKey: 'cargaCno.progressDone', done: true, result: toResult(event.body as CargaDto) };
        }
        const sent = event.type === HttpEventType.UploadProgress && event.total ? event.loaded / event.total : 0;
        // La subida es el 90 %; el resto es lo que tarda el servidor en procesar.
        return sent < 1
          ? { progress: Math.round(sent * 90), messageKey: 'cargaCno.progressUploading', done: false }
          : { progress: 90, messageKey: 'cargaCno.progressProcessing', done: false };
      })
    );
  }

  /**
   * La plantilla oficial vacía de un tipo (o la completa). Se pide al servidor
   * (`GET /api/{cno|cuoc}/upload/plantilla/:tipo`, como la versión desplegada); si no la
   * tiene (la copia local responde 404), se usa la copia que trae el front en
   * `assets/plantillas/{cno|cuoc}/`.
   */
  template(type: TemplateType, classification: Classification = 'cno'): Observable<Blob> {
    const prefix = classification.toUpperCase();
    return this.http.get(`/api/${classification}/upload/plantilla/${type}`, { responseType: 'blob' }).pipe(
      catchError(() => this.http.get(`assets/plantillas/${classification}/Plantilla_${prefix}_${type}.xlsx`, { responseType: 'blob' }))
    );
  }

  /** Olvida la lista de ocupaciones guardada: la próxima vez se vuelve a pedir. */
  refreshOccupations(classification: Classification = 'cno'): void {
    this.occupationLists.delete(classification);
  }

  /** Todas las páginas de un listado `{ data, page, totalPages }`, de a 500, juntas. */
  private pages<T>(path: string): Observable<T[]> {
    const page = (number: number) => this.http.get<ApiPage<T>>(path, { params: queryParams({ page: number, limit: PAGE_LIMIT }) });
    return page(1).pipe(
      expand((current) => (current.page < current.totalPages ? page(current.page + 1) : EMPTY)),
      reduce((all: T[], current) => all.concat(current.data), [])
    );
  }

  /**
   * Escritura en un catálogo: traduce el error del servidor y convierte la respuesta al
   * modelo.
   */
  private write(endpoint: CatalogEndpoint, request: () => Observable<Record<string, unknown>>): Observable<CatalogItem> {
    return defer(() => {
      return request();
    }).pipe(
      catchError((error: unknown) => throwError(() => toCatalogError(error))),
      map((row) => toItem(endpoint, row))
    );
  }
}
