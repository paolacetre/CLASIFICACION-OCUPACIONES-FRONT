import { SelectOption } from './instrumento-3.model';

/**
 * Listas fijas del formulario de Instrumento 3 (las mismas del front original): sectores y enlaces de
 * referencia. Área de desempeño, nivel de cualificación, habilidades y conocimientos ya no son fijas: salen
 * del catálogo CNO del servidor (`Instrumento3Service.catalogs()`).
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

/** Documentos de referencia para construir la propuesta (se abren en otra pestaña). */
export const REFERENCE_LINKS: { labelKey: string; url: string }[] = [
  { labelKey: 'instrumento3.refGlossary', url: 'https://drive.google.com/file/d/1QEO36kuNkOWDLW1kmXqWViMzO62XA5kP/view' },
  { labelKey: 'instrumento3.refLevel', url: 'https://drive.google.com/file/d/1QEO36kuNkOWDLW1kmXqWViMzO62XA5kP/view' },
  { labelKey: 'instrumento3.refSkills', url: 'https://drive.google.com/file/d/1vvnkJpDGdUxj64RItVCL3HeNwYb3awIs/view' },
  { labelKey: 'instrumento3.refKnowledge', url: 'https://drive.google.com/file/d/1UzRPqzp5VO-l4JiIj83Cf_HLgb9KcwKB/view' }
];
