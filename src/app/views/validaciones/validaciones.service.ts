import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { serverMessageOf } from '../../shared/auth/auth.service';
import { InstrumentoDto, OcupacionResumenDto } from '../comparativa/comparativa.service';
import { PerfilService } from '../perfil/perfil.service';
import {
  Informant,
  InstrumentKind,
  ItemGrade,
  OccupationAdjustment,
  Review,
  ReviewItem,
  ReviewOccupation,
  ReviewRecord,
  ReviewSave,
  SectionId,
  emptyInformant,
  reviewStateOf
} from './validaciones.model';

/** El instrumento ya no existe (404) o no tiene nada que validar. */
export const REVIEW_NOT_FOUND = 'REVIEW_NOT_FOUND';
/** El instrumento no está abierto a validación (409 del servidor: aún no se envió o ya se cerró). */
export const REVIEW_NOT_SENT = 'REVIEW_NOT_SENT';
/** El rol de la sesión no puede validar, o el experto no está asignado a este instrumento (403). */
export const REVIEW_FORBIDDEN = 'REVIEW_FORBIDDEN';
/** El servidor rechazó lo enviado (400); lleva su mensaje. */
export const REVIEW_INVALID = 'REVIEW_INVALID';

/** Error de Validación experta: `message` es el código (`REVIEW_*`) y `serverMessage` el texto del servidor, si lo dio. */
export class ReviewError extends Error {
  constructor(code: string, readonly serverMessage = '') {
    super(code);
  }
}

/** Ítem del snapshot de preguntas del instrumento: lo que el experto valida. */
interface PreguntaDto {
  identificador?: string | null;
  detalle?: string | null;
  codigo?: string | null;
  /** Copia de la ocupación (Instrumento 2); Instrumento 3 no lo trae. */
  codOcupacion?: string | null;
  inactivo?: boolean;
}

/** `GET /api/instrumento2[/:id]` con lo que agrega la validación experta. */
interface Instrumento2Dto extends InstrumentoDto {
  preguntas?: PreguntaDto[] | null;
  /** Copias que se enviaron a validar (null mientras no se envía). */
  ocupacionesEnviadas?: string[] | null;
}

/** Fila de `GET /api/instrumento3` y `GET /api/instrumento3/:id`. */
interface Instrumento3Dto {
  id: number;
  estado: string;
  fecha?: string | null;
  analista?: string | null;
  nombreOcupacion: string;
  codOcupacionCNO?: string | null;
  codOcupacionCUOC?: string | null;
  areaDesempeno?: string | null;
  nivelCualificacion?: string | null;
  descripcion?: string | null;
  preguntas?: PreguntaDto[] | null;
}

type EstadoCampo = 'aplica' | 'no_aplica' | 'requiere_ajuste' | 'propuesta_mejora';

/** `GET /api/instrumentoN/:id/validacion-experta`: la validación de quien tiene la sesión (null si aún no guardó). */
interface ValidacionDto {
  estado: string;
  observaciones?: string | null;
  campos: Array<{ campo: string; estado: EstadoCampo; comentario?: string | null; codOcupacion?: string | null }>;
  datosGenerales?: {
    nombreApellidos?: string;
    email?: string;
    telefono?: string;
    departamento?: string;
    municipio?: string;
    empresaEntidad?: string;
    cargo?: string;
    profesion?: string;
  };
  infoOcupaciones?: Array<{ codOcupacion: string; areaDesempeno?: string; descripcion?: string }> | null;
}

const BASE: Record<InstrumentKind, string> = { I2: '/api/instrumento2', I3: '/api/instrumento3' };

/**
 * Cómo se muestra cada identificador del snapshot: sección, número de criterio y clave del título.
 * Los demás (fechas, trazabilidad, observación del analista, códigos de Instrumento 3) son
 * contexto: no se califican.
 */
const SNAPSHOT_FIELDS: Record<string, { section: SectionId; criterion: number; key: string }> = {
  nombre: { section: 'info', criterion: 1, key: 'name' },
  area_desempeno: { section: 'info', criterion: 2, key: 'area' },
  nivel_cualificacion: { section: 'info', criterion: 3, key: 'level' },
  descripcion: { section: 'info', criterion: 4, key: 'description' },
  funcion: { section: 'functions', criterion: 5, key: 'function' },
  denominacion: { section: 'denominations', criterion: 6, key: 'denomination' },
  habilidad: { section: 'skills', criterion: 7, key: 'skill' },
  otras_habilidades: { section: 'skills', criterion: 7, key: 'otherSkills' },
  conocimiento: { section: 'knowledge', criterion: 8, key: 'knowledge' },
  otros_conocimientos: { section: 'knowledge', criterion: 8, key: 'otherKnowledge' },
  relacionada: { section: 'related', criterion: 9, key: 'related' }
};

/** Orden de las secciones con ítems (las de la pantalla, sin Datos generales). */
const SECTION_ORDER: SectionId[] = ['info', 'functions', 'skills', 'knowledge', 'denominations', 'related'];

/** Clave de un ítem en la pantalla: con la copia delante en Instrumento 2 (agrupa varias ocupaciones). */
function itemKey(kind: InstrumentKind, occupationCode: string, field: string): string {
  return kind === 'I2' ? `${occupationCode}::${field}` : field;
}

/**
 * Ítems calificables de una ocupación a partir de su parte del snapshot, con la misma regla de
 * nombres del servidor (`camposDeSnapshot`): un identificador que aparece una vez va tal cual y uno
 * repetido se numera por orden de aparición («funcion_1», «funcion_2»…).
 */
function itemsFromSnapshot(kind: InstrumentKind, occupationCode: string, preguntas: PreguntaDto[]): ReviewItem[] {
  const totals = new Map<string, number>();
  for (const pregunta of preguntas) {
    const identifier = text(pregunta.identificador) || 'campo';
    totals.set(identifier, (totals.get(identifier) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const items: ReviewItem[] = [];
  for (const pregunta of preguntas) {
    const identifier = text(pregunta.identificador) || 'campo';
    const occurrence = (seen.get(identifier) ?? 0) + 1;
    seen.set(identifier, occurrence);
    const shown = SNAPSHOT_FIELDS[identifier];
    if (!shown) {
      continue;
    }
    const isList = (totals.get(identifier) ?? 1) > 1;
    const field = isList ? `${identifier}_${occurrence}` : identifier;
    const detail = text(pregunta.detalle);
    const code = text(pregunta.codigo);
    items.push({
      id: itemKey(kind, occupationCode, field),
      field,
      occupationCode,
      section: shown.section,
      labelKey: `validaciones.item.${shown.key}`,
      // «5. FUNCIONES 2» lleva número solo si el campo se repite, como su nombre en el servidor.
      n: isList ? occurrence : undefined,
      criterion: shown.criterion,
      // «F-2126.01 - Planificar…», como la versión desplegada.
      value: code && detail ? `${code} - ${detail}` : detail,
      inactive: pregunta.inactivo === true
    });
  }
  // En pantalla van por sección; dentro de cada una, en el orden del snapshot.
  return SECTION_ORDER.flatMap((section) => items.filter((item) => item.section === section));
}

/** El valor de un campo simple de la ocupación en el snapshot (nombre, nivel…). */
function snapshotValue(preguntas: PreguntaDto[], identifier: string): string {
  return text(preguntas.find((pregunta) => pregunta.identificador === identifier)?.detalle);
}

/**
 * Ocupaciones de un Instrumento 2 desde su snapshot: una por copia, en el orden en que se enviaron
 * (la principal primero), cada una con sus datos y sus ítems.
 */
function occupationsOfInstrument2(dto: Instrumento2Dto): ReviewOccupation[] {
  const preguntas = dto.preguntas ?? [];
  const principal = text(dto.ocupacion);
  const codeOf = (pregunta: PreguntaDto) => text(pregunta.codOcupacion) || principal;
  const present = [...new Set(preguntas.map(codeOf))];
  const preferred = dto.ocupacionesEnviadas?.length ? dto.ocupacionesEnviadas : (dto.ocupaciones ?? []).map((item) => item.codigo);
  const order = [principal, ...preferred, ...present].filter((code, index, all) => code && present.includes(code) && all.indexOf(code) === index);
  const summary = new Map<string, OcupacionResumenDto>((dto.ocupaciones ?? []).map((item) => [item.codigo, item]));
  return order.map((copyCode) => {
    const own = preguntas.filter((pregunta) => codeOf(pregunta) === copyCode);
    const listed = summary.get(copyCode);
    return {
      code: text(listed?.codigoOriginal) || (copyCode === principal ? text(dto.codigoOriginal) : '') || copyCode,
      copyCode,
      name: snapshotValue(own, 'nombre') || text(listed?.nombre),
      level: snapshotValue(own, 'nivel_cualificacion'),
      area: snapshotValue(own, 'area_desempeno'),
      description: snapshotValue(own, 'descripcion'),
      adjustable: true,
      items: itemsFromSnapshot('I2', copyCode, own)
    };
  });
}

/** La propuesta de Instrumento 3 (una sola ocupación) desde su snapshot. El servidor no le guarda propuestas de texto. */
function occupationOfInstrument3(dto: Instrumento3Dto): ReviewOccupation {
  const preguntas = dto.preguntas ?? [];
  return {
    code: text(dto.codOcupacionCNO) || text(dto.codOcupacionCUOC) || `I3-${dto.id}`,
    copyCode: '',
    name: snapshotValue(preguntas, 'nombre') || text(dto.nombreOcupacion),
    level: snapshotValue(preguntas, 'nivel_cualificacion') || text(dto.nivelCualificacion),
    area: snapshotValue(preguntas, 'area_desempeno') || text(dto.areaDesempeno),
    description: snapshotValue(preguntas, 'descripcion') || text(dto.descripcion),
    adjustable: false,
    items: itemsFromSnapshot('I3', '', preguntas)
  };
}

/** Calificaciones guardadas, con la misma clave de los ítems. */
function toGrades(kind: InstrumentKind, dto: ValidacionDto | null): Record<string, ItemGrade> {
  const grades: Record<string, ItemGrade> = {};
  for (const campo of dto?.campos ?? []) {
    grades[itemKey(kind, text(campo.codOcupacion), campo.campo)] = { grade: campo.estado, detail: text(campo.comentario) };
  }
  return grades;
}

function toProposals(dto: ValidacionDto | null): Record<string, Partial<OccupationAdjustment>> {
  const proposals: Record<string, Partial<OccupationAdjustment>> = {};
  for (const info of dto?.infoOcupaciones ?? []) {
    proposals[text(info.codOcupacion)] = {
      ...(info.areaDesempeno !== undefined ? { area: text(info.areaDesempeno) } : {}),
      ...(info.descripcion !== undefined ? { description: text(info.descripcion) } : {})
    };
  }
  return proposals;
}

function toInformant(dto: ValidacionDto['datosGenerales']): Informant {
  return {
    fullName: text(dto?.nombreApellidos),
    email: text(dto?.email),
    phone: text(dto?.telefono),
    department: text(dto?.departamento),
    municipality: text(dto?.municipio),
    company: text(dto?.empresaEntidad),
    position: text(dto?.cargo),
    profession: text(dto?.profesion)
  };
}

function toReviewError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const codes: Record<number, string> = { 400: REVIEW_INVALID, 403: REVIEW_FORBIDDEN, 404: REVIEW_NOT_FOUND, 409: REVIEW_NOT_SENT };
  return codes[error.status] ? new ReviewError(codes[error.status], serverMessageOf(error)) : error;
}

/** Copias de las ocupaciones que se enviaron a validar, con su código del catálogo y su nombre (las demás no son del experto). */
function sentOccupations(dto: Instrumento2Dto): Array<{ code: string; name: string }> {
  const summary = dto.ocupaciones?.length ? dto.ocupaciones : [{ codigo: dto.ocupacion, codigoOriginal: dto.codigoOriginal, nombre: text(dto.nombre), panelOrigen: dto.panelOrigen }];
  const sent = new Set(dto.ocupacionesEnviadas ?? []);
  return summary
    .filter((item) => sent.size === 0 || sent.has(item.codigo))
    .map((item) => ({ code: text(item.codigoOriginal) || text(item.codigo), name: text(item.nombre) }));
}

/**
 * Validación experta contra el backend. La bandeja junta Instrumento 2 (`GET /api/instrumento2`) e
 * Instrumento 3 (`GET /api/instrumento3`) desde que llegan al experto (al experto el servidor solo
 * le entrega los que le asignaron). La revisión pide el instrumento (`GET …/:id`, con el snapshot de
 * preguntas que se envió a validar) y la validación propia de quien tiene la sesión; se guarda con
 * `POST …/:id/validacion-experta`. Cada experto tiene su propia validación: no ve las de los demás.
 */
@Injectable({ providedIn: 'root' })
export class ValidacionesService {
  private readonly http = inject(HttpClient);
  private readonly perfilService = inject(PerfilService);

  /** Lo que está en manos del experto o ya pasó por él, lo más reciente primero. */
  list(): Observable<ReviewRecord[]> {
    return forkJoin({
      i2: this.http.get<Instrumento2Dto[]>(BASE.I2),
      // Sin Instrumento 3 (p. ej. un rol que no lo puede leer) la bandeja sigue con Instrumento 2.
      i3: this.http.get<Instrumento3Dto[]>(BASE.I3).pipe(catchError(() => of([] as Instrumento3Dto[])))
    }).pipe(
      map(({ i2, i3 }) => {
        const records: ReviewRecord[] = [];
        for (const dto of i2 ?? []) {
          const state = reviewStateOf(dto.estado);
          if (state) {
            records.push({ id: dto.id, kind: 'I2', state, occupations: sentOccupations(dto), analyst: text(dto.analista), date: text(dto.fecha) });
          }
        }
        for (const dto of i3 ?? []) {
          const state = reviewStateOf(dto.estado);
          if (state) {
            records.push({
              id: dto.id,
              kind: 'I3',
              state,
              occupations: [{ code: text(dto.codOcupacionCNO) || text(dto.codOcupacionCUOC), name: text(dto.nombreOcupacion) }],
              analyst: text(dto.analista),
              date: text(dto.fecha)
            });
          }
        }
        return records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      })
    );
  }

  /**
   * Abre un instrumento: sus ocupaciones y criterios desde el snapshot que se envió a validar y la
   * validación ya guardada por quien revisa. Sin validación guardada, los datos generales se
   * precargan con su perfil.
   */
  review(record: ReviewRecord): Observable<Review> {
    const occupations$: Observable<ReviewOccupation[]> =
      record.kind === 'I2'
        ? this.http.get<Instrumento2Dto>(`${BASE.I2}/${record.id}`).pipe(map((dto) => occupationsOfInstrument2(dto)))
        : this.http.get<Instrumento3Dto>(`${BASE.I3}/${record.id}`).pipe(map((dto) => [occupationOfInstrument3(dto)]));
    return forkJoin({
      occupations: occupations$,
      saved: this.http.get<ValidacionDto | null>(`${BASE[record.kind]}/${record.id}/validacion-experta`)
    }).pipe(
      switchMap(({ occupations, saved }) => {
        const withItems = occupations.filter((occupation) => occupation.items.length > 0);
        if (!withItems.length) {
          return throwError(() => new ReviewError(REVIEW_NOT_FOUND));
        }
        const base = {
          record,
          occupations: withItems,
          grades: toGrades(record.kind, saved),
          observations: text(saved?.observaciones),
          proposals: toProposals(saved),
          hasSavedValidation: !!saved
        };
        if (saved) {
          return of({ ...base, informant: toInformant(saved.datosGenerales) });
        }
        return this.perfilService.get().pipe(
          map((profile) => ({ ...base, informant: { ...emptyInformant(), fullName: profile.name, email: profile.email, phone: profile.phone } })),
          catchError(() => of({ ...base, informant: emptyInformant() }))
        );
      }),
      catchError((error: unknown) => throwError(() => toReviewError(error)))
    );
  }

  /**
   * `POST /api/instrumento{2|3}/:id/validacion-experta`. Con `en_revision` guarda el avance y el
   * instrumento sigue «Recibido»; con el veredicto final se cierra la validación de este experto (el
   * instrumento cambia de estado cuando cierran todos los asignados). Volver a guardar reemplaza lo
   * anterior de este experto.
   */
  save(record: ReviewRecord, data: ReviewSave): Observable<void> {
    return defer(() => {
      const informant = data.informant;
      return this.http.post(`${BASE[record.kind]}/${record.id}/validacion-experta`, {
        estado: data.verdict,
        observaciones: data.observations.trim() || undefined,
        datosGenerales: {
          nombreApellidos: informant.fullName.trim() || undefined,
          email: informant.email.trim() || undefined,
          telefono: informant.phone.trim() || undefined,
          departamento: informant.department || undefined,
          municipio: informant.municipality || undefined,
          empresaEntidad: informant.company.trim() || undefined,
          cargo: informant.position.trim() || undefined,
          profesion: informant.profession.trim() || undefined
        },
        // Propuestas de área y descripción por ocupación: el servidor las guarda como propuesta, no reescribe la ocupación.
        infoOcupaciones: data.proposals.length
          ? data.proposals.map((proposal) => ({ codOcupacion: proposal.occupationCode, areaDesempeno: proposal.area, descripcion: proposal.description }))
          : undefined,
        campos: data.items.map((item) => ({
          campo: item.field,
          estado: item.grade,
          // Un solo comentario por criterio: el veredicto ya dice si es un motivo, un ajuste o una propuesta.
          comentario: item.detail.trim() || undefined,
          codOcupacion: item.occupationCode || undefined
        }))
      });
    }).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => toReviewError(error)))
    );
  }
}
