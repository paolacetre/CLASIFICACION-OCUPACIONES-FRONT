/**
 * Modelo de "Actualización > CNO": los catálogos oficiales de la CNO que se
 * administran desde aquí (nivel de cualificación, área de desempeño,
 * habilidades y conocimientos) y la lista de ocupaciones.
 */

/** Catálogos con alta, edición y borrado propios. */
export type CatalogKind = 'level' | 'area' | 'skill' | 'knowledge';

/** Pestañas de la vista: los cuatro catálogos y las ocupaciones. */
export type UpdateTab = CatalogKind | 'occupation';

/** Pestañas de Actualización, en el orden en que se muestran. */
export const UPDATE_TABS: readonly UpdateTab[] = ['level', 'area', 'skill', 'knowledge', 'occupation'];

/** Un registro de la tabla: de un catálogo o una ocupación. */
export interface CatalogItem {
  code: string;
  name: string;
  /** Vacía si no tiene. */
  description: string;
  /** Fecha de registro como `DD/MM/YYYY`; vacía si el backend no la tiene (hoy ningún catálogo la guarda). */
  registeredAt: string;
  /** Los catálogos no tienen estado en el backend: siempre activos. Las ocupaciones sí. */
  active: boolean;
}

/** Lo que se escribe al agregar o editar. El código solo se escribe al agregar (después no cambia). */
export interface CatalogDraft {
  code: string;
  name: string;
  description: string;
}

/** Límites del formulario, los mismos de la versión desplegada. */
export const CATALOG_LIMITS = { codeMax: 10, nameMin: 3, nameMax: 255 };

/** Largo máximo del nombre: 150 en el nivel (CNO y CUOC) y 255 en los demás catálogos, como el backend. */
export function nameMax(kind: CatalogKind): number {
  return kind === 'level' ? 150 : CATALOG_LIMITS.nameMax;
}

/** Las áreas de cualificación de CUOC no tienen descripción (solo sigla y nombre). */
export function hasDescription(classification: 'cno' | 'cuoc', kind: CatalogKind): boolean {
  return !(classification === 'cuoc' && kind === 'area');
}

/** Largo máximo de la descripción: 1000 en el nivel y 2000 en los demás catálogos. */
export function descriptionMax(kind: CatalogKind): number {
  return kind === 'level' ? 1000 : 2000;
}

/** Código válido: letras o números, sin espacios. */
export const CODE_PATTERN = /^[A-Za-z0-9]+$/;

/** Filtros del panel "Filtros": estado y descripción. */
export type StatusFilter = 'all' | 'active' | 'inactive';
/** Filtro por descripción: todas, con descripción o sin ella. */
export type DescriptionFilter = 'all' | 'with' | 'without';

/** Opciones del filtro de estado. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'active', 'inactive'];
/** Opciones del filtro de descripción. */
export const DESCRIPTION_FILTERS: readonly DescriptionFilter[] = ['all', 'with', 'without'];

/** Columna por la que se ordena la tabla. */
export type CatalogSort = 'code' | 'name' | 'description' | 'status' | 'date';

/** Pestañas con columna Estado (como la versión desplegada: solo Conocimientos). */
export function showsStatus(tab: UpdateTab): boolean {
  return tab === 'knowledge';
}

/** Nivel y área llevan el código que se escribe; habilidades y conocimientos toman el siguiente número disponible (lo asigna el servidor). */
export function requiresCode(kind: CatalogKind): boolean {
  return kind === 'level' || kind === 'area';
}

/** Orden natural de los códigos: "2" antes que "10". */
export function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true });
}

/** `DD/MM/YYYY` de una fecha del backend (`2026-10-16…`); lo que no tenga esa forma se deja como llega. */
export function registrationDate(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

/** Fecha `DD/MM/YYYY` como número comparable (las vacías van al final al ordenar de menor a mayor). */
export function dateKey(value: string): number {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? Number(match[3] + match[2] + match[1]) : Number.MAX_SAFE_INTEGER;
}

// ---------- Registrar una ocupación (asistente de 5 pasos) ----------

/** Pasos del asistente "Registrar nueva ocupación CNO". */
export type WizardStep = 'basic' | 'denominations' | 'functions' | 'competences' | 'summary';

/** Pasos del asistente "Registrar nueva ocupación", en orden. */
export const WIZARD_STEPS: readonly WizardStep[] = ['basic', 'denominations', 'functions', 'competences', 'summary'];

/** Límites del formulario de CNO, los mismos del backend y de la versión desplegada. */
export const OCCUPATION_LIMITS = { nameMin: 3, nameMax: 200, descriptionMax: 1000, traceabilityMax: 150, denominationMax: 200, codeLength: 4 };

/** Límites del formulario de CUOC (su backend admite nombres y denominaciones más largos y código de 5 dígitos). */
export const CUOC_OCCUPATION_LIMITS: typeof OCCUPATION_LIMITS = { nameMin: 3, nameMax: 300, descriptionMax: 2000, traceabilityMax: 150, denominationMax: 300, codeLength: 5 };

/** Límites del formulario de ocupación según la clasificación (en CUOC el código tiene 5 dígitos). */
export function occupationLimits(classification: 'cno' | 'cuoc'): typeof OCCUPATION_LIMITS {
  return classification === 'cuoc' ? CUOC_OCCUPATION_LIMITS : OCCUPATION_LIMITS;
}

/** Código CNO: exactamente 4 dígitos. */
export const OCCUPATION_CODE_PATTERN = /^\d{4}$/;

/** Código de la ocupación: 4 dígitos en CNO y 5 en CUOC. */
export function occupationCodePattern(classification: 'cno' | 'cuoc'): RegExp {
  return classification === 'cuoc' ? /^\d{5}$/ : OCCUPATION_CODE_PATTERN;
}

/** Letras (con tildes y ñ), números, espacios y la puntuación habitual: lo que acepta el backend en nombres y denominaciones. */
export const OCCUPATION_TEXT_PATTERN = /^[\p{L}\p{N}\s.,;:()\-/'"&ºª°]+$/u;

/** Una opción de las listas del asistente: función, habilidad, conocimiento u ocupación. */
export interface PickOption {
  code: string;
  label: string;
}

/** Función elegida: del catálogo (con código) o nueva (sin código; el servidor la crea al guardar). */
export interface DraftFunction {
  code: string | null;
  text: string;
}

/** Lo que se escribe en el asistente. */
export interface OccupationDraft {
  code: string;
  name: string;
  /** Códigos del catálogo (`codDesempeno`, `codCualificacion`). */
  areaCode: string;
  levelCode: string;
  /** `YYYY-MM-DD`, la fecha de hoy: no se puede cambiar. */
  registeredOn: string;
  active: boolean;
  traceability: string;
  description: string;
  /** La primera es la principal. */
  denominations: string[];
  functions: DraftFunction[];
  skills: PickOption[];
  knowledge: PickOption[];
  related: PickOption[];
}

/** Hoy como `YYYY-MM-DD` en la hora del equipo. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Borrador vacío del asistente; la fecha de registro es la de hoy. */
export function createEmptyOccupation(): OccupationDraft {
  return {
    code: '',
    name: '',
    areaCode: '',
    levelCode: '',
    registeredOn: todayIso(),
    active: true,
    traceability: '',
    description: '',
    denominations: [],
    functions: [],
    skills: [],
    knowledge: [],
    related: []
  };
}
