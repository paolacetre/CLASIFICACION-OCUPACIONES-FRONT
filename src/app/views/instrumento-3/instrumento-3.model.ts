/**
 * Modelo de Instrumento 3: la propuesta de un perfil ocupacional nuevo, tal
 * como se diligencia en el formulario.
 */

/** Opción de un desplegable: lo que se guarda (`value`) y lo que se lee (`label`). */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Estado de una propuesta en el backend:
 * BORRADOR → GUARDADO → ENVIADO_EXPERTO → (VALIDADO | AJUSTES_SOLICITADOS | APROBADO_FINAL).
 */
export type ProposalState = string;

/** Lo que se diligencia: datos del informante y la propuesta ocupacional. */
export interface ProposalDraft {
  /* ---------- Datos generales (informante) ---------- */
  /** YYYY-MM-DD (el valor de un campo de fecha); si se borra, el servidor pone la de hoy. */
  date: string;
  fullName: string;
  email: string;
  phone: string;
  /** Claves de los desplegables (ver `geografia.ts` y `instrumento-3.catalogs.ts`). */
  department: string;
  municipality: string;
  organization: string;
  position: string;
  profession: string;
  sector: string;

  /* ---------- Propuesta ocupacional ---------- */
  occupationName: string;
  /** Clave del área de desempeño ('1' a '9') y del nivel de cualificación ('nivel1'…). */
  area: string;
  level: string;
  description: string;
  /** Una por casilla; las casillas vacías no se guardan. */
  functions: string[];
  denominations: string[];
  relatedOccupations: string[];
  /** Nombres de las habilidades y los conocimientos marcados. */
  skills: string[];
  otherSkills: string;
  knowledge: string[];
  otherKnowledge: string;
}

/** Datos generales de quien diligencia: el servidor los recuerda por usuario para no volver a escribirlos. */
export type Informant = Pick<ProposalDraft, 'fullName' | 'email' | 'phone' | 'department' | 'municipality' | 'organization' | 'position' | 'profession' | 'sector'>;

/** Campos de los datos generales que el servidor recuerda del analista. */
export const INFORMANT_FIELDS: (keyof Informant)[] = ['fullName', 'email', 'phone', 'department', 'municipality', 'organization', 'position', 'profession', 'sector'];

/** Pone en el borrador los datos generales que el servidor recuerda (solo los que tienen valor). */
export function applyInformant(draft: ProposalDraft, informant: Informant | null): ProposalDraft {
  const known = Object.fromEntries(INFORMANT_FIELDS.filter((field) => informant?.[field]).map((field) => [field, informant![field]]));
  return { ...draft, ...known };
}

/** Propuesta guardada en el servidor. */
export interface Proposal extends ProposalDraft {
  id: number;
  state: ProposalState;
  /** Usuario de quien la creó. */
  analyst: string;
}

/** Casillas con las que empieza cada lista (como en el formulario original). */
const INITIAL_FUNCTIONS = 3;
const INITIAL_DENOMINATIONS = 3;
const INITIAL_RELATED = 2;

/** Hoy como YYYY-MM-DD (fecha local), el formato de un campo de fecha. */
export function todayAsInputDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Formulario en blanco: solo trae la fecha de hoy; el nombre, el correo y los
 * demás datos generales empiezan vacíos (`informant` solo lo usan los datos de prueba).
 */
export function createEmptyDraft(informant: { name?: string; email?: string } = {}): ProposalDraft {
  return {
    date: todayAsInputDate(),
    fullName: informant.name ?? '',
    email: informant.email ?? '',
    phone: '',
    department: '',
    municipality: '',
    organization: '',
    position: '',
    profession: '',
    sector: '',
    occupationName: '',
    area: '',
    level: '',
    description: '',
    functions: Array.from({ length: INITIAL_FUNCTIONS }, () => ''),
    denominations: Array.from({ length: INITIAL_DENOMINATIONS }, () => ''),
    relatedOccupations: Array.from({ length: INITIAL_RELATED }, () => ''),
    skills: [],
    otherSkills: '',
    knowledge: [],
    otherKnowledge: ''
  };
}

/** Borrador para editar una propuesta guardada: cada lista conserva al menos sus casillas iniciales. */
export function draftOf(proposal: Proposal): ProposalDraft {
  const { id: _id, state: _state, analyst: _analyst, ...draft } = proposal;
  const padded = (items: string[], minimum: number) => [...items, ...Array.from({ length: Math.max(0, minimum - items.length) }, () => '')];
  return {
    ...draft,
    functions: padded(draft.functions, INITIAL_FUNCTIONS),
    denominations: padded(draft.denominations, INITIAL_DENOMINATIONS),
    relatedOccupations: padded(draft.relatedOccupations, INITIAL_RELATED),
    skills: [...draft.skills],
    knowledge: [...draft.knowledge]
  };
}

/** Campos obligatorios para enviar al experto. */
export type RequiredField = 'fullName' | 'email' | 'occupationName' | 'area' | 'level' | 'description';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo con forma válida (lo exige el envío al experto). */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Campos obligatorios que faltan (o el correo, si está mal escrito) para enviar al experto. */
export function missingFields(draft: ProposalDraft): RequiredField[] {
  const required: RequiredField[] = ['fullName', 'email', 'occupationName', 'area', 'level', 'description'];
  return required.filter((field) => !draft[field].trim() || (field === 'email' && !isValidEmail(draft.email)));
}

/** Solo un borrador o una propuesta guardada admiten edición, envío y borrado (la misma regla del backend). */
export function isEditable(state: ProposalState): boolean {
  return state === 'BORRADOR' || state === 'GUARDADO';
}
