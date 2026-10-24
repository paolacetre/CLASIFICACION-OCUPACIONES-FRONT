import { SelectOption } from './instrumento-3.model';

/**
 * Listas fijas del formulario de Instrumento 3 (las mismas del front original).
 * Son catálogos de referencia del formato, no datos del sistema: el backend
 * guarda la clave elegida como texto y no tiene un servicio que las entregue.
 */

/** Sectores económicos del formato. */
export const SECTORS: SelectOption[] = [
  { value: 'aeronautica', label: 'Aeronáutica' },
  { value: 'agroindustria_panela', label: 'Agroindustria de la Panela' },
  { value: 'agua_saneamiento', label: 'Agua Potable y Saneamiento Básico' },
  { value: 'artes_escenicas', label: 'Artes escénicas' },
  { value: 'avicola', label: 'Avícola' },
  { value: 'bibliotecas', label: 'Bibliotecas' },
  { value: 'biotecnologia', label: 'Biotecnología' },
  { value: 'confiteria', label: 'Confitería' },
  { value: 'consultoria', label: 'Consultoría empresarial' },
  { value: 'direccion_gerencia', label: 'Dirección y gerencia' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'economia_campesina', label: 'Economía Campesina' },
  { value: 'fique_fibras', label: 'Fique y otras fibras naturales' },
  { value: 'industria_azucar', label: 'Industria de azúcar y los biocombustibles' },
  { value: 'metalmecanico', label: 'Metalmecánico' },
  { value: 'metrologia', label: 'Metrología' },
  { value: 'multilingüismo', label: 'Multilingüismo' },
  { value: 'pesca', label: 'Pesca' },
  { value: 'petroquimica', label: 'Petroquímica' },
  { value: 'plastico_caucho', label: 'Plástico, caucho y fibras sintéticas' },
  { value: 'prod_agropecuaria', label: 'Producción agropecuaria ecológica' },
  { value: 'refinacion', label: 'Refinación' },
  { value: 'salud', label: 'Salud' },
  { value: 'seguridad_vigilancia', label: 'Seguridad y Vigilancia' },
  { value: 'servicios_personales', label: 'Servicios personales' },
  { value: 'soldadura', label: 'Soldadura y ensayos destructivos' },
  { value: 'talento_humano', label: 'Talento humano' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'transporte_ferreo', label: 'Transporte Férreo' },
  { value: 'transporte_fluvial', label: 'Transporte Fluvial' },
  { value: 'transporte_maritimo', label: 'Transporte Marítimo' }
];

/** La clave es también el código del área (`codArea`). */
export const AREAS: SelectOption[] = [
  { value: '1', label: '1. Gestión y negocios' },
  { value: '2', label: '2. Ciencias naturales, aplicadas y relacionadas' },
  { value: '3', label: '3. Salud' },
  { value: '4', label: '4. Ciencias sociales, educación, servicios gubernamentales y religión' },
  { value: '5', label: '5. Arte, cultura, recreación y deporte' },
  { value: '6', label: '6. Ventas y servicios' },
  { value: '7', label: '7. Explotación primaria y extractiva' },
  { value: '8', label: '8. Operación de equipos, de transporte y oficios' },
  { value: '9', label: '9. Procesamiento, fabricación y ensamble' }
];

/** Niveles de cualificación del formato (la clave se traduce con `LEVEL_CODES`). */
export const LEVELS: SelectOption[] = [
  { value: 'nivel1', label: 'Nivel 1 (A)' },
  { value: 'nivel2', label: 'Nivel 2 (B)' },
  { value: 'nivel34', label: 'Nivel 3-4 (C)' },
  { value: 'nivel5', label: 'Nivel 5 (D)' },
  { value: 'nivel67', label: 'Nivel 6-7 (E)' }
];

/** Código numérico que el backend guarda junto a la clave del nivel (`codNivelCualificacion`). */
export const LEVEL_CODES: Record<string, number> = { nivel1: 1, nivel2: 2, nivel34: 3, nivel5: 5, nivel67: 6 };

/** Habilidades que se pueden marcar en la propuesta. */
export const SKILLS: string[] = [
  'Comunicación asertiva',
  'Evaluación y control de actividades',
  'Relaciones interpersonales',
  'Vigilancia de las operaciones',
  'Gestión de recursos materiales',
  'Liderazgo',
  'Criterio y toma de decisiones',
  'Trabajo en equipo',
  'Planificación y organización',
  'Orientación al servicio',
  'Adaptabilidad al cambio',
  'Pensamiento analítico',
  'Resolución de problemas',
  'Atención al detalle',
  'Gestión del tiempo'
];

/** Conocimientos que se pueden marcar en la propuesta. */
export const KNOWLEDGE: string[] = [
  'Administración y gerencia',
  'Interpretación de planos',
  'Recursos humanos y de personal',
  'Leyes y gobierno',
  'Transporte',
  'Manejo de las TIC',
  'Ingeniería y tecnología',
  'Matemáticas',
  'Física',
  'Química',
  'Biología',
  'Economía y contabilidad',
  'Ventas y mercadeo',
  'Servicio al cliente',
  'Seguridad y salud en el trabajo',
  'Producción y procesamiento',
  'Mecánica',
  'Electrónica y electricidad',
  'Idiomas',
  'Educación y formación'
];

/** Documentos de referencia para construir la propuesta (se abren en otra pestaña). */
export const REFERENCE_LINKS: { labelKey: string; url: string }[] = [
  { labelKey: 'instrumento3.refGlossary', url: 'https://drive.google.com/file/d/1QEO36kuNkOWDLW1kmXqWViMzO62XA5kP/view' },
  { labelKey: 'instrumento3.refLevel', url: 'https://drive.google.com/file/d/1QEO36kuNkOWDLW1kmXqWViMzO62XA5kP/view' },
  { labelKey: 'instrumento3.refSkills', url: 'https://drive.google.com/file/d/1vvnkJpDGdUxj64RItVCL3HeNwYb3awIs/view' },
  { labelKey: 'instrumento3.refKnowledge', url: 'https://drive.google.com/file/d/1UzRPqzp5VO-l4JiIj83Cf_HLgb9KcwKB/view' }
];
