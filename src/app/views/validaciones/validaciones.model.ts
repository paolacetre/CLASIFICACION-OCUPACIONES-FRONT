import { normalizeText } from '../../shared/ui/list';
/**
 * Validación experta (versión desplegada `/clasificacion/validacion-experta`): bandeja de los
 * instrumentos que el analista envió al experto (Instrumento 2 e Instrumento 3) y su revisión ítem
 * por ítem. Todo se guarda con `POST /api/instrumento{2|3}/:id/validacion-experta`.
 */

/** De qué instrumento viene la fila. Los ids son únicos entre los dos (tabla `instrumento`). */
export type InstrumentKind = 'I2' | 'I3';

/**
 * Estado de la bandeja, traducido del estado del instrumento (la misma tabla `ESTADO_UI` de la
 * versión desplegada):
 * - `received` (Recibido) ← ENVIADO_EXPERTO: llegó del analista; «Guardar cambios» lo deja aquí.
 * - `filled` (Diligenciado) ← VALIDADO: veredicto «rechazada», que la pantalla no envía (queda en 0).
 * - `edited` (Editado) ← AJUSTES_SOLICITADOS: enviado con algún «No aplica» o «Requiere ajuste».
 * - `sent` (Enviado) ← APROBADO_FINAL: enviado con todo «Aplica» o «Propuesta de mejora».
 */
export type ReviewState = 'received' | 'filled' | 'edited' | 'sent';

/** Estados de la bandeja, en el orden de los indicadores. */
export const REVIEW_STATES: readonly ReviewState[] = ['received', 'filled', 'edited', 'sent'];

/** Estado del instrumento en el backend → estado de la bandeja; null si aún no llega al experto. */
export function reviewStateOf(backendState: string): ReviewState | null {
  switch (backendState) {
    case 'ENVIADO_EXPERTO':
      return 'received';
    case 'VALIDADO':
      return 'filled';
    case 'AJUSTES_SOLICITADOS':
      return 'edited';
    case 'APROBADO_FINAL':
      return 'sent';
    default:
      return null;
  }
}

/**
 * Solo se califica mientras el instrumento está en manos de los expertos («Recibido»): el servidor
 * rechaza guardar en cualquier otro estado. Un experto que ya cerró su validación puede volver a
 * cambiarla mientras los demás asignados no terminen.
 */
export function isEditable(state: ReviewState): boolean {
  return state === 'received';
}

/** Ocupación tal como se lista en la bandeja. */
export interface ListedOccupation {
  code: string;
  name: string;
}

/** Fila de la bandeja. */
export interface ReviewRecord {
  id: number;
  kind: InstrumentKind;
  state: ReviewState;
  occupations: ListedOccupation[];
  analyst: string;
  /** Fecha y hora ISO en que se registró (para ordenar); vacía si no hay. */
  date: string;
}

/* ---------- Revisión ---------- */

/** Secciones de una ocupación, en el orden de la pantalla (la 1, Datos generales, es común a todas). */
export type SectionId = 'general' | 'info' | 'functions' | 'skills' | 'knowledge' | 'denominations' | 'related';

/** Secciones del editor, en el orden de la navegación. */
export const SECTIONS: readonly SectionId[] = ['general', 'info', 'functions', 'skills', 'knowledge', 'denominations', 'related'];

/** Un ítem que el experto califica. */
export interface ReviewItem {
  /**
   * Clave del ítem en la pantalla (la de su calificación): `<copia de la ocupación>::<campo>` en
   * Instrumento 2, que agrupa varias ocupaciones, y el campo a secas en Instrumento 3.
   */
  id: string;
  /**
   * Campo tal como lo identifica el servidor en el snapshot de preguntas del instrumento: el
   * identificador si aparece una sola vez («nombre») o numerado por orden si se repite («funcion_2»).
   */
  field: string;
  /** Copia de la ocupación a la que pertenece (Instrumento 2); vacía en Instrumento 3. */
  occupationCode: string;
  section: SectionId;
  /** Clave de traducción del título en pantalla y su número (parámetro `n`) en las secciones de varios elementos. */
  labelKey: string;
  n?: number;
  /**
   * Número del criterio, como la versión desplegada: 1 nombre, 2 área, 3 nivel, 4 descripción,
   * 5 funciones, 6 denominaciones, 7 habilidades, 8 conocimientos, 9 ocupaciones relacionadas.
   */
  criterion: number;
  /** Lo que envió el analista (con su código delante en las listas: «F-2126.01 - …»). */
  value: string;
  /** Función o denominación que estaba inactiva en la copia cuando se envió. */
  inactive: boolean;
}

/** Ocupación que se revisa, con sus datos y sus ítems por sección. */
export interface ReviewOccupation {
  /** Código de la ocupación en el catálogo (el que se muestra). */
  code: string;
  /** Copia de la ocupación en el instrumento (`codOcupacion` del snapshot); vacía en Instrumento 3. */
  copyCode: string;
  name: string;
  level: string;
  area: string;
  description: string;
  /**
   * El experto puede proponer otra área y otra descripción (`infoOcupaciones`): las ocupaciones de
   * Instrumento 2. El servidor las guarda como propuesta; no reescribe la ocupación.
   */
  adjustable: boolean;
  items: ReviewItem[];
}

/** Propuesta del experto sobre el área y la descripción de una ocupación (`infoOcupaciones` del backend). */
export interface OccupationAdjustment {
  area: string;
  description: string;
}

/** Propuesta que viaja al guardar: solo lo que cambió, con la copia de la ocupación a la que va. */
export type OccupationProposal = Partial<OccupationAdjustment> & { occupationCode: string };

/** Datos generales del informante (el experto que diligencia). El backend los guarda aparte de los ítems. */
export interface Informant {
  /** «Nombre y apellidos» en un solo campo, como la pantalla desplegada (viaja en `nombreApellidos`). */
  fullName: string;
  email: string;
  phone: string;
  department: string;
  municipality: string;
  company: string;
  position: string;
  profession: string;
}

/** Datos del informante vacíos. */
export function emptyInformant(): Informant {
  return { fullName: '', email: '', phone: '', department: '', municipality: '', company: '', position: '', profession: '' };
}

/** Datos del informante que el servidor exige para enviar definitivamente un Instrumento 2. */
export const REQUIRED_INFORMANT_FIELDS: readonly (keyof Informant)[] = ['fullName', 'email', 'phone', 'department', 'municipality', 'company', 'position', 'profession'];

/** Calificación de un ítem (vacía mientras no se califica). */
export type Grade = '' | 'aplica' | 'no_aplica' | 'requiere_ajuste' | 'propuesta_mejora';

/** Opciones de calificación de un ítem. */
export const GRADES: readonly Exclude<Grade, ''>[] = ['aplica', 'no_aplica', 'requiere_ajuste', 'propuesta_mejora'];

/** «Requiere ajuste» y «Propuesta de mejora» piden el detalle; «No aplica» admite un motivo opcional. */
export function detailRequired(grade: Grade): boolean {
  return grade === 'requiere_ajuste' || grade === 'propuesta_mejora';
}

/** Calificación de un ítem y su detalle. */
export interface ItemGrade {
  grade: Grade;
  /** Motivo (No aplica), ajuste (Requiere ajuste) o propuesta (Propuesta de mejora). */
  detail: string;
}

/** Instrumento abierto para revisar. */
export interface Review {
  record: ReviewRecord;
  occupations: ReviewOccupation[];
  /** Calificación guardada de cada ítem, por id. */
  grades: Record<string, ItemGrade>;
  informant: Informant;
  observations: string;
  /** Propuestas de área y descripción ya guardadas, por copia de la ocupación. */
  proposals: Record<string, Partial<OccupationAdjustment>>;
  /** Ya existía un veredicto guardado (avance o final). */
  hasSavedValidation: boolean;
}

/** Decisión que se guarda: avance (`en_revision`) o el veredicto final, derivado de las calificaciones. */
export type Verdict = 'en_revision' | 'aprobada' | 'ajustes_solicitados';

/**
 * Veredicto final como lo deriva la versión desplegada: si algún ítem quedó en «No aplica» o
 * «Requiere ajuste», se piden ajustes; si no, se aprueba.
 */
export function derivedVerdict(grades: Iterable<ItemGrade>): Exclude<Verdict, 'en_revision'> {
  for (const value of grades) {
    if (value.grade === 'no_aplica' || value.grade === 'requiere_ajuste') {
      return 'ajustes_solicitados';
    }
  }
  return 'aprobada';
}

/** Lo que se guarda (avance o veredicto final). */
export interface ReviewSave {
  verdict: Verdict;
  informant: Informant;
  observations: string;
  /** Solo los ítems calificados (en el avance pueden faltar; en el final están todos). */
  items: Array<ReviewItem & ItemGrade>;
  /** Área y descripción propuestas para cada ocupación, solo las que cambiaron. */
  proposals: OccupationProposal[];
}

/* ---------- Bandeja ---------- */

/** Columnas por las que se ordena la bandeja. */
export type ReviewSortColumn = 'id' | 'kind' | 'occupation' | 'analyst' | 'date' | 'state';

/** Texto con el que se busca una fila (instrumento, códigos y nombres de ocupación y analista), sin tildes ni mayúsculas. */
export function searchableText(record: ReviewRecord): string {
  return normalizeText(
    [`instrumento ${record.kind === 'I2' ? 2 : 3}`, `${record.id}`, record.analyst, ...record.occupations.flatMap((item) => [item.code, item.name])].join(' ')
  );
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «Hoy» / «Ayer» o «06 oct 2026», y la hora «11:50 a. m.», como la versión desplegada (hora local). */
export function dayAndTime(iso: string, now: Date = new Date()): { day: string; time: string; relative: 'today' | 'yesterday' | null } {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { day: '', time: '', relative: null };
  }
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return {
    day: `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    time: `${String(hour12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'a. m.' : 'p. m.'}`,
    relative: days === 0 ? 'today' : days === 1 ? 'yesterday' : null
  };
}

/** Fecha ISO → «DD/MM/AAAA» (para la fecha de Datos generales). */
export function displayDate(iso: string): string {
  const date = iso ? new Date(iso) : null;
  return !date || Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
