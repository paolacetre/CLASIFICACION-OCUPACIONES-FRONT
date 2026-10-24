import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, of, switchMap, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { LEVEL_CODES } from './instrumento-3.catalogs';
import { INFORMANT_FIELDS, Informant, Proposal, ProposalDraft, todayAsInputDate } from './instrumento-3.model';

/** La propuesta pedida no existe (el 404 del servidor). */
export const PROPOSAL_NOT_FOUND = 'PROPOSAL_NOT_FOUND';
/** Ya fue enviada al experto y no admite cambios, o le falta el nombre para confirmarla (el 409 del servidor). */
export const PROPOSAL_LOCKED = 'PROPOSAL_LOCKED';
/** El servidor no aceptó los datos (p. ej. el correo está mal escrito). */
export const INVALID_PROPOSAL = 'INVALID_PROPOSAL';
/** Quedó guardada, pero no se pudo enviar al experto. */
export const SAVED_NOT_SENT = 'PROPOSAL_SAVED_NOT_SENT';

/** Error de `saveAndSend()` cuando el guardado salió bien y el envío no: dice qué propuesta quedó guardada. */
export class SavedNotSentError extends Error {
  constructor(readonly proposalId: number) {
    super(SAVED_NOT_SENT);
  }
}

/** `Instrumento3DetailDto`: lo que responde el backend por cada propuesta. */
interface PropuestaDto {
  id: number;
  estado: string;
  /** Fecha y hora ISO. */
  fecha?: string | null;
  analista?: string | null;
  nombreApellidos?: string | null;
  email?: string | null;
  telefono?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  empresaEntidad?: string | null;
  cargo?: string | null;
  profesion?: string | null;
  sector?: string | null;
  nombreOcupacion?: string | null;
  areaDesempeno?: string | null;
  nivelCualificacion?: string | null;
  descripcion?: string | null;
  otrasHabilidades?: string | null;
  otrosConocimientos?: string | null;
  funciones?: string[] | null;
  denominaciones?: string[] | null;
  habilidades?: string[] | null;
  conocimientos?: string[] | null;
  ocupacionesRelacionadas?: string[] | null;
}

/** `GET` / `PUT /api/mi-cuenta/perfil-analista`: los datos generales que el servidor recuerda de quien tiene la sesión. */
interface PerfilAnalistaDto {
  fecha?: string | null;
  nombreApellidos?: string | null;
  email?: string | null;
  telefono?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  empresaEntidad?: string | null;
  cargo?: string | null;
  profesion?: string | null;
  sector?: string | null;
}

function toInformant(dto: PerfilAnalistaDto | null): Informant | null {
  if (!dto) {
    return null;
  }
  const informant: Informant = {
    fullName: text(dto.nombreApellidos),
    email: text(dto.email),
    phone: text(dto.telefono),
    department: text(dto.departamento),
    municipality: text(dto.municipio),
    organization: text(dto.empresaEntidad),
    position: text(dto.cargo),
    profession: text(dto.profesion),
    sector: text(dto.sector)
  };
  return INFORMANT_FIELDS.some((field) => informant[field]) ? informant : null;
}

/** Fecha y hora ISO → YYYY-MM-DD del día local; hoy si no hay fecha. */
function toInputDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? todayAsInputDate(date) : todayAsInputDate();
}

function toProposal(dto: PropuestaDto): Proposal {
  const list = (items: string[] | null | undefined) => (items ?? []).map((item) => text(item)).filter(Boolean);
  return {
    id: dto.id,
    state: dto.estado,
    analyst: text(dto.analista),
    date: toInputDate(dto.fecha),
    fullName: text(dto.nombreApellidos),
    email: text(dto.email),
    phone: text(dto.telefono),
    department: text(dto.departamento),
    municipality: text(dto.municipio),
    organization: text(dto.empresaEntidad),
    position: text(dto.cargo),
    profession: text(dto.profesion),
    sector: text(dto.sector),
    occupationName: text(dto.nombreOcupacion),
    area: text(dto.areaDesempeno),
    level: text(dto.nivelCualificacion),
    description: text(dto.descripcion),
    functions: list(dto.funciones),
    denominations: list(dto.denominaciones),
    relatedOccupations: list(dto.ocupacionesRelacionadas),
    skills: list(dto.habilidades),
    otherSkills: text(dto.otrasHabilidades),
    knowledge: list(dto.conocimientos),
    otherKnowledge: text(dto.otrosConocimientos)
  };
}

/**
 * Cuerpo de `POST` / `PATCH /api/instrumento3`. Las casillas vacías de las
 * listas no viajan. El correo vacío se omite (el backend lo valida como correo
 * aunque sea opcional) y la fecha vacía también (el backend pone la de hoy).
 */
function toBody(draft: ProposalDraft): Record<string, unknown> {
  const filled = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  const email = draft.email.trim();
  return {
    ...(draft.date ? { fecha: draft.date } : {}),
    nombreApellidos: draft.fullName.trim(),
    ...(email ? { email } : {}),
    telefono: draft.phone.trim(),
    departamento: draft.department,
    municipio: draft.municipality,
    empresaEntidad: draft.organization.trim(),
    cargo: draft.position.trim(),
    profesion: draft.profession.trim(),
    sector: draft.sector,
    nombreOcupacion: draft.occupationName.trim(),
    areaDesempeno: draft.area,
    codArea: Number(draft.area) || 0,
    nivelCualificacion: draft.level,
    codNivelCualificacion: LEVEL_CODES[draft.level] ?? 0,
    descripcion: draft.description.trim(),
    funciones: filled(draft.functions),
    denominaciones: filled(draft.denominations),
    ocupacionesRelacionadas: filled(draft.relatedOccupations),
    habilidades: filled(draft.skills),
    otrasHabilidades: draft.otherSkills.trim(),
    conocimientos: filled(draft.knowledge),
    otrosConocimientos: draft.otherKnowledge.trim()
  };
}

/** Traduce la respuesta de error del backend a un código estable. */
function toProposalError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const codes: Record<number, string> = { 400: INVALID_PROPOSAL, 404: PROPOSAL_NOT_FOUND, 409: PROPOSAL_LOCKED };
  return codes[error.status] ? new Error(codes[error.status]) : error;
}

/**
 * Propuestas de Instrumento 3, contra el backend (`/api/instrumento3`, tablas
 * `instrumento` e `instrumento3_propuesta`). Una propuesta nace como BORRADOR,
 * se confirma (GUARDADO) y se envía al experto (ENVIADO_EXPERTO); desde ahí ya
 * no admite cambios. Esta vista solo diligencia: lo enviado se consulta en
 * Validación experta.
 */
@Injectable({ providedIn: 'root' })
export class Instrumento3Service {
  private readonly http = inject(HttpClient);

  /**
   * `GET /api/mi-cuenta/perfil-analista`: los datos generales que el servidor
   * recuerda de quien tiene la sesión, para llenar el formulario al abrirlo.
   * `null` si aún no hay o si el servidor no tiene ese servicio (la copia
   * local del backend es anterior a la versión desplegada y responde 404).
   */
  informant(): Observable<Informant | null> {
    return this.http.get<PerfilAnalistaDto | null>('/api/mi-cuenta/perfil-analista').pipe(
      map(toInformant),
      catchError(() => of(null))
    );
  }

  /**
   * Guarda el borrador: `POST /api/instrumento3` si es nuevo o
   * `PATCH /api/instrumento3/:id` si ya existe. Queda en BORRADOR.
   */
  save(draft: ProposalDraft, id: number | null = null): Observable<Proposal> {
    return this.write(() =>
      this.rememberInformant(draft).pipe(
        switchMap(() => (id === null ? this.http.post<PropuestaDto>('/api/instrumento3', toBody(draft)) : this.http.patch<PropuestaDto>(`/api/instrumento3/${id}`, toBody(draft))))
      )
    );
  }

  /**
   * Guarda lo que está en el formulario y lo envía al experto: después del
   * guardado encadena `POST /:id/guardar` (GUARDADO) y `POST /:id/enviar-experto`.
   * Si el guardado sale bien y el envío no, responde `SAVED_NOT_SENT`.
   */
  saveAndSend(draft: ProposalDraft, id: number | null = null): Observable<Proposal> {
    return this.save(draft, id).pipe(
      switchMap((saved) => this.sendToExpert(saved.id).pipe(catchError(() => throwError(() => new SavedNotSentError(saved.id)))))
    );
  }

  /** Envía al experto una propuesta ya guardada (la confirma primero: el backend exige GUARDADO). */
  private sendToExpert(id: number): Observable<Proposal> {
    return this.write(() =>
      this.http.post<PropuestaDto>(`/api/instrumento3/${id}/guardar`, null).pipe(switchMap(() => this.http.post<PropuestaDto>(`/api/instrumento3/${id}/enviar-experto`, null)))
    );
  }

  /**
   * `PUT /api/mi-cuenta/perfil-analista`: antes de guardar la propuesta, el
   * servidor recuerda los datos generales (como hace la versión desplegada).
   * Si falla o el servidor no tiene ese servicio, la propuesta se guarda igual.
   */
  private rememberInformant(draft: ProposalDraft): Observable<unknown> {
    const body: PerfilAnalistaDto = {
      fecha: draft.date,
      nombreApellidos: draft.fullName.trim(),
      email: draft.email.trim(),
      telefono: draft.phone.trim(),
      departamento: draft.department,
      municipio: draft.municipality,
      empresaEntidad: draft.organization.trim(),
      cargo: draft.position.trim(),
      profesion: draft.profession.trim(),
      sector: draft.sector
    };
    return this.http.put('/api/mi-cuenta/perfil-analista', body).pipe(catchError(() => of(null)));
  }

  /** Escribe y traduce la respuesta (o el error) del servidor. */
  private write(request: () => Observable<PropuestaDto>): Observable<Proposal> {
    return defer(() => {
      return request();
    }).pipe(
      catchError((error: unknown) => throwError(() => toProposalError(error))),
      map(toProposal)
    );
  }
}
