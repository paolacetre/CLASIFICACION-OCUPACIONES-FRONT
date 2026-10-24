import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, defer, from, map, shareReplay, switchMap, tap, throwError, toArray } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { todayAsStored } from '../../shared/format/today';
import { AnalysisItem, AnalysisOccupation } from '../analisis/analisis.model';
import { COMPARISON_STATUSES, Comparison, ComparisonPage, ComparisonQuery, ComparisonStatus, ComparisonSummary, OccupationChange, cleanItems } from './comparativa.model';
import { normalizeText } from '../../shared/ui/list';

/** La comparativa pedida no existe (el 404 del servidor). */
export const COMPARISON_NOT_FOUND = 'COMPARISON_NOT_FOUND';
/** La comparativa ya está en manos del experto y no admite cambios (el 409 del servidor). */
export const COMPARISON_LOCKED = 'COMPARISON_LOCKED';
/** No se puede enviar a Instrumento 2: a la ocupación principal le falta el nombre o al menos una función (el 400 del servidor). */
export const COMPARISON_INCOMPLETE = 'COMPARISON_INCOMPLETE';

/** Cuánto se reutiliza la lista ya pedida (la lista y el resumen salen de la misma respuesta). */
const LIST_CACHE_MS = 5000;

interface ItemDto {
  codigo?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
}

/** Resumen de una ocupación de la comparativa, dentro de la lista. */
export interface OcupacionResumenDto {
  codigo: string;
  codigoOriginal: string;
  nombre: string;
  panelOrigen: string;
  nivelCualificacion?: string | null;
  areaDesempeno?: string | null;
}

/**
 * `Instrumento2DetailDto`: en `GET /api/instrumento2` es la ocupación principal
 * de cada comparativa (con el resumen de todas en `ocupaciones`); en
 * `GET /api/instrumento2/:id/comparacion` hay uno por cada ocupación.
 */
export interface InstrumentoDto {
  id: number;
  /** PENDIENTE, EN_REVISION, GUARDADO, ENVIADO_EXPERTO, VALIDADO, AJUSTES_SOLICITADOS, APROBADO_FINAL. */
  estado: string;
  /** Código de la copia que creó Análisis. */
  ocupacion: string;
  /** Código de la ocupación en el catálogo. */
  codigoOriginal: string;
  panelOrigen: string;
  nombre?: string | null;
  descripcion?: string | null;
  nivelCualificacion?: string | null;
  areaDesempeno?: string | null;
  /** YYYY-MM-DD. */
  fechaRegistro?: string | null;
  trazabilidad?: string | null;
  /** Una sola por comparativa. */
  observacion?: string | null;
  /** Fecha y hora ISO en que llegó de Análisis. */
  fecha?: string | null;
  /** Usuario de quien la guardó. */
  analista?: string | null;
  funciones?: ItemDto[] | null;
  denominaciones?: ItemDto[] | null;
  habilidades?: ItemDto[] | null;
  conocimientos?: ItemDto[] | null;
  ocupacionesRelacionadas?: ItemDto[] | null;
  ocupaciones?: OcupacionResumenDto[] | null;
}

/** Estado del backend → estado que muestra Comparativa (la misma tabla del front original). */
const STATUS_BY_STATE: Record<string, ComparisonStatus> = {
  PENDIENTE: 'Recibido',
  EN_REVISION: 'Editado',
  AJUSTES_SOLICITADOS: 'Editado',
  GUARDADO: 'En Instrumento 2',
  VALIDADO: 'Diligenciado',
  ENVIADO_EXPERTO: 'Enviado',
  APROBADO_FINAL: 'Enviado'
};

/** Fecha y hora ISO → DD/MM/YYYY del día local; vacío si no hay fecha. */
function toDisplayDay(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? todayAsStored(date) : '';
}

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY' (sin convertir zona horaria); vacío si no hay fecha. */
function toDisplayDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function items(list: ItemDto[] | null | undefined, field: 'nombre' | 'descripcion'): AnalysisItem[] {
  return (list ?? []).map((item) => ({ code: text(item.codigo), text: text(item[field]) }));
}

function catalogOf(panelOrigen: string): AnalysisOccupation['catalog'] {
  return panelOrigen === 'CUOC' ? 'CUOC' : 'CNO';
}

/** Ocupación completa (detalle de la comparativa). */
export function toOccupation(dto: InstrumentoDto): AnalysisOccupation {
  return {
    catalog: catalogOf(dto.panelOrigen),
    code: text(dto.codigoOriginal) || text(dto.ocupacion),
    copyCode: text(dto.ocupacion),
    // El backend no entrega el estado de la copia.
    status: '',
    name: text(dto.nombre),
    level: text(dto.nivelCualificacion),
    area: text(dto.areaDesempeno),
    description: text(dto.descripcion),
    functions: items(dto.funciones, 'descripcion'),
    skills: items(dto.habilidades, 'nombre'),
    knowledge: items(dto.conocimientos, 'nombre'),
    denominations: items(dto.denominaciones, 'nombre'),
    related: items(dto.ocupacionesRelacionadas, 'nombre'),
    registeredAt: toDisplayDate(dto.fechaRegistro),
    traceability: text(dto.trazabilidad)
  };
}

/** Ocupación de la lista: solo lo que trae el resumen (sus componentes se piden al abrirla). */
export function toListedOccupation(dto: OcupacionResumenDto): AnalysisOccupation {
  return {
    catalog: catalogOf(dto.panelOrigen),
    code: text(dto.codigoOriginal) || text(dto.codigo),
    copyCode: text(dto.codigo),
    status: '',
    name: text(dto.nombre),
    level: text(dto.nivelCualificacion),
    area: text(dto.areaDesempeno),
    description: '',
    functions: [],
    skills: [],
    knowledge: [],
    denominations: [],
    related: [],
    registeredAt: '',
    traceability: ''
  };
}

/** Lista del borrador como la recibe el backend: `{ codigo?, descripcion }` (funciones) o `{ codigo?, nombre }`; sin filas vacías. */
function snapshot(items: AnalysisItem[], field: 'descripcion' | 'nombre'): Record<string, string>[] {
  return cleanItems(items).map((item) => (item.code ? { codigo: item.code, [field]: item.text } : { [field]: item.text }));
}

function toComparison(dto: InstrumentoDto, occupations: AnalysisOccupation[]): Comparison {
  return {
    id: dto.id,
    occupations,
    analyst: text(dto.analista),
    date: toDisplayDay(dto.fecha),
    // Un estado desconocido se muestra como Recibido en vez de dejar la etiqueta vacía.
    status: STATUS_BY_STATE[dto.estado] ?? 'Recibido',
    observation: text(dto.observacion)
  };
}

/** Traduce la respuesta de error del backend a un código estable. */
function toComparisonError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const codes: Record<number, string> = { 400: COMPARISON_INCOMPLETE, 404: COMPARISON_NOT_FOUND, 409: COMPARISON_LOCKED };
  return codes[error.status] ? new Error(codes[error.status]) : error;
}

/**
 * Comparativas de ocupaciones, contra el backend. Una comparativa es un
 * "instrumento 2" del backend (`/api/instrumento2`): nace cuando Análisis
 * guarda (`POST /api/analisis/guardar`) y su id es el del instrumento.
 *
 * - El backend entrega la lista completa, sin filtros ni páginas: la búsqueda,
 *   el filtro por estado, la paginación y el resumen se resuelven aquí.
 * - Tiene una sola observación por comparativa (no una por ocupación).
 * - No guarda quién ni cuándo la modificó: solo quién la creó y cuándo.
 */
@Injectable({ providedIn: 'root' })
export class ComparativaService {
  private readonly http = inject(HttpClient);

  private cache: { at: number; all: Observable<Comparison[]> } | null = null;

  /** Cuántas comparativas hay en cada estado. */
  summary(): Observable<ComparisonSummary> {
    return this.all().pipe(
      map((comparisons) => {
        const summary = Object.fromEntries(COMPARISON_STATUSES.map((status) => [status, 0])) as ComparisonSummary;
        comparisons.forEach((comparison) => summary[comparison.status]++);
        return summary;
      })
    );
  }

  /** Una página de la lista, de la más reciente a la más antigua, por ID, ocupación (nombre o código) o analista, y por estado. */
  list(query: ComparisonQuery): Observable<ComparisonPage> {
    return this.all().pipe(
      map((comparisons) => {
        const term = normalizeText(query.text);
        const matches = comparisons.filter(
          (comparison) =>
            (!query.status || comparison.status === query.status) &&
            (!term ||
              String(comparison.id) === term ||
              normalizeText(comparison.analyst).includes(term) ||
              comparison.occupations.some((occupation) => normalizeText(occupation.name).includes(term) || normalizeText(occupation.code).includes(term)))
        );
        const start = (query.page - 1) * query.pageSize;
        return { items: matches.slice(start, start + query.pageSize), total: matches.length };
      })
    );
  }

  /** `GET /api/instrumento2/:id/comparacion`: la comparativa con sus 2 o 3 ocupaciones completas. */
  get(id: number): Observable<Comparison> {
    return this.http.get<InstrumentoDto[]>(`/api/instrumento2/${id}/comparacion`).pipe(
      catchError((error: unknown) => throwError(() => toComparisonError(error))),
      map((occupations) => {
        if (!occupations.length) {
          throw new Error(COMPARISON_NOT_FOUND);
        }
        return toComparison(occupations[0], occupations.map(toOccupation));
      })
    );
  }

  /**
   * Guarda lo editado en el modo edición: un `PATCH /api/instrumento2/:id` por cada ocupación cambiada, uno tras
   * otro, con su `codigoOcupacion` (la copia), sus datos y sus cinco listas completas (el backend reemplaza las cinco
   * juntas; un elemento sin código es nuevo y lo relaciona por su texto). La observación es una sola por comparativa
   * (`instrumento.observacion`): viaja una sola vez, en la primera petición (si no cambió ninguna ocupación, va
   * sola). Deja la comparativa como "Editado" y la devuelve completa.
   */
  saveChanges(id: number, changes: OccupationChange[], observation: string | null): Observable<Comparison> {
    const bodies: Record<string, unknown>[] = changes.map((change) => ({
      codigoOcupacion: change.copyCode,
      nombre: change.name.trim(),
      nivelCualificacion: change.level,
      areaDesempeno: change.area,
      descripcion: change.description.trim(),
      funciones: snapshot(change.functions, 'descripcion'),
      denominaciones: snapshot(change.denominations, 'nombre'),
      habilidades: snapshot(change.skills, 'nombre'),
      conocimientos: snapshot(change.knowledge, 'nombre'),
      ocupacionesRelacionadas: snapshot(change.related, 'nombre')
    }));
    if (observation !== null) {
      if (bodies.length) {
        bodies[0] = { ...bodies[0], observacion: observation.trim() };
      } else {
        bodies.push({ observacion: observation.trim() });
      }
    }
    return this.write(id, () =>
      from(bodies).pipe(
        concatMap((body) => this.http.patch(`/api/instrumento2/${id}`, body)),
        toArray()
      )
    );
  }

  /** `POST /api/instrumento2/:id/guardar`: la deja "En Instrumento 2", lista para enviarla al experto desde allí. */
  sendToInstrument2(id: number): Observable<Comparison> {
    return this.write(id, () => this.http.post(`/api/instrumento2/${id}/guardar`, null));
  }

  /** La lista cambió fuera de este servicio (Análisis guardó una comparativa): la próxima consulta la vuelve a pedir. */
  invalidate(): void {
    this.cache = null;
  }

  /** `GET /api/instrumento2`: todas las comparativas (la más reciente primero); se reutiliza unos segundos. */
  private all(): Observable<Comparison[]> {
    if (!this.cache || Date.now() - this.cache.at > LIST_CACHE_MS) {
      const all = this.http.get<InstrumentoDto[]>('/api/instrumento2').pipe(
        map((rows) => rows.map((row) => toComparison(row, (row.ocupaciones ?? []).map(toListedOccupation))).sort((a, b) => b.id - a.id)),
        // Si falla no se guarda el error: la siguiente consulta lo intenta de nuevo.
        tap({ error: () => this.invalidate() }),
        shareReplay(1)
      );
      this.cache = { at: Date.now(), all };
    }
    return this.cache.all;
  }

  /** Escribe y devuelve la comparativa como quedó. */
  private write(id: number, request: () => Observable<unknown>): Observable<Comparison> {
    return defer(() => {
      return request();
    }).pipe(
      catchError((error: unknown) => throwError(() => toComparisonError(error))),
      tap(() => this.invalidate()),
      // La respuesta trae solo la ocupación principal: se pide la comparativa completa.
      switchMap(() => this.get(id))
    );
  }
}
