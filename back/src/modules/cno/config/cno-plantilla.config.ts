import { HojaPlantilla } from '../../../common/utils/plantilla-excel.util';
import { TipoCargaCno } from './cno-carga.config';

/**
 * Plantilla del cargue CNO. Las hojas y encabezados son los del libro oficial
 * (`CNO_2026_10-09Actualizado (2).xlsx`), sin las columnas que ningún cargador
 * lee (`id`, `codigo`, `reg_habilidad_cno`, `nombre_desempe_cno`, `nivel_cualificacion_cno` y el
 * `cod_cualificacion_cno` repetido de Ocupaciones). Cada encabezado está entre
 * los que leen `CnoBulkUploadService` y `DEFINICIONES_CNO`; si se cambia uno
 * allí, se cambia aquí.
 */

const CODIGO_NUMERICO = 'Solo números, sin puntos ni espacios.';
const CON_CEROS = 'Escríbelo como texto para conservar los ceros a la izquierda (0011, no 11).';
const ESTADO = 'Escribe 1 o TRUE (activa), 0 o FALSE (inactiva). Si se deja vacía se toma como activa.';
const YA_CARGADO = (hoja: string) =>
  `El código debe existir ya en el sistema: cárgalo antes, o usa «Todo el archivo» con la hoja «${hoja}» completa.`;

export const HOJAS_PLANTILLA_CNO: HojaPlantilla[] = [
  {
    nombre: 'nivel_cualificacion',
    columnas: [
      { encabezado: 'cod_cualificacion_cno', obligatoria: true, nota: 'Código del nivel tal como lo publica la CNO, por ejemplo «Nivel 1 (A)».' },
      { encabezado: 'niveles_cualificacion_cno', obligatoria: true, nota: 'Nombre del nivel de cualificación.' },
      { encabezado: 'descripcion', obligatoria: false },
    ],
  },
  {
    nombre: 'Area_desempeño',
    columnas: [
      { encabezado: 'cod_desempeno_cno', obligatoria: true, nota: `Código del área. ${CODIGO_NUMERICO}` },
      { encabezado: 'nom_desempeno_cno', obligatoria: true, nota: 'Nombre del área de desempeño.' },
      { encabezado: 'desc_desempeno_cno', obligatoria: false },
    ],
  },
  {
    nombre: 'Ocupaciones - C.N.O.',
    columnas: [
      { encabezado: 'cod_ocupacion_cno', obligatoria: true, nota: `Código de 4 dígitos. ${CON_CEROS} No puede repetirse en el archivo.` },
      { encabezado: 'nomb_ocupacion_cno', obligatoria: true },
      { encabezado: 'desc_ocupacion_cno', obligatoria: false },
      { encabezado: 'cod_desempeno_cno', obligatoria: false, nota: `Necesaria para crear ocupaciones nuevas. ${YA_CARGADO('Area_desempeño')}` },
      { encabezado: 'cod_cualificacion_cno', obligatoria: false, nota: `Necesaria para crear ocupaciones nuevas. ${YA_CARGADO('nivel_cualificacion')}` },
      { encabezado: 'campo_ocupacional', obligatoria: false, nota: `Código del campo ocupacional. ${CON_CEROS}` },
      { encabezado: 'descripcion_campo', obligatoria: false, nota: 'Nombre del campo ocupacional.' },
      { encabezado: 'activa_ocupacion_cno', obligatoria: false, nota: ESTADO },
    ],
  },
  {
    nombre: 'Funcion',
    columnas: [
      { encabezado: 'cod_funcion', obligatoria: true, nota: 'Código de la función, por ejemplo F-01.' },
      { encabezado: 'desc_funcion_cno', obligatoria: true },
    ],
  },
  {
    nombre: 'Funciones - C.N.O.',
    columnas: [
      { encabezado: 'cod_funcion_cno', obligatoria: true, nota: 'Código de la función dentro de la ocupación, por ejemplo F-0011.01.' },
      { encabezado: 'cod_funcion', obligatoria: false, nota: 'Código del catálogo (hoja Funcion), por ejemplo F-01.' },
      { encabezado: 'desc_funcion_cno', obligatoria: false },
      { encabezado: 'cod_ocupacion_cno', obligatoria: true, nota: `Ocupación a la que pertenece la función. ${CON_CEROS}` },
      { encabezado: 'activa_funcion_cno', obligatoria: false, nota: ESTADO },
    ],
  },
  {
    nombre: 'Denominaciones - C.N.O.',
    columnas: [
      { encabezado: 'cod_denominacion_cno', obligatoria: true, nota: 'Por ejemplo D-0011.001.' },
      { encabezado: 'desc_denominacion_cno', obligatoria: false },
      { encabezado: 'cod_ocupacion_cno', obligatoria: true, nota: `Ocupación a la que pertenece la denominación. ${CON_CEROS}` },
      { encabezado: 'activa_denominacion_cno', obligatoria: false, nota: ESTADO },
    ],
  },
  {
    nombre: 'Relacionadas - C.N.O.',
    columnas: [
      { encabezado: 'Código de la ocupación - C.N.O.', obligatoria: true },
      { encabezado: 'Nombre de la ocupación - C.N.O.', obligatoria: false },
      { encabezado: 'Código de la ocupación relacionada - C.N.O.', obligatoria: true },
      { encabezado: 'Nombre de la ocupación relacionada - C.N.O.', obligatoria: false },
    ],
  },
  {
    nombre: 'Habilidad',
    columnas: [
      { encabezado: 'cod_hab_dest', obligatoria: true, nota: `Código de la habilidad. ${CODIGO_NUMERICO}` },
      { encabezado: 'nomb_hab_dest', obligatoria: true },
      { encabezado: 'desc_hab_dest', obligatoria: false },
    ],
  },
  {
    nombre: 'Habilidades - C.N.O.',
    columnas: [
      { encabezado: 'Código de la ocupación - C.N.O.', obligatoria: true },
      { encabezado: 'Código de la habilidad - C.N.O.', obligatoria: true, nota: CODIGO_NUMERICO },
      { encabezado: 'Nombre de la habilidad - C.N.O.', obligatoria: false },
    ],
  },
  {
    nombre: 'Nivel de conocimiento',
    columnas: [
      { encabezado: 'cod_conocimiento_cno', obligatoria: true, nota: `Código del conocimiento. ${CODIGO_NUMERICO}` },
      { encabezado: 'nomb_conocimiento_cno', obligatoria: true },
      { encabezado: 'desc_conocimiento_cno', obligatoria: false },
    ],
  },
  {
    nombre: 'Conocimientos - C.N.O.',
    columnas: [
      { encabezado: 'Código de la ocupación - C.N.O.', obligatoria: true },
      { encabezado: 'Código del conocimiento - C.N.O.', obligatoria: true, nota: CODIGO_NUMERICO },
      { encabezado: 'Nombre del conocimiento - C.N.O.', obligatoria: false },
    ],
  },
];

export type PlantillaCno = TipoCargaCno | 'completa';

/**
 * Hojas de cada plantilla. «ocupacion» trae también sus hojas de relación
 * (opcionales al cargar), que son las que `procesarTipo('ocupacion')` lee
 * junto con la ocupación. «completa» es el libro entero: sirve para «Cargar
 * todo» y para el cargue del libro completo en el buscador.
 */
export const HOJAS_POR_PLANTILLA_CNO: Record<PlantillaCno, readonly string[]> = {
  nivel: ['nivel_cualificacion'],
  area: ['Area_desempeño'],
  habilidades: ['Habilidad'],
  conocimientos: ['Nivel de conocimiento'],
  ocupacion: [
    'Ocupaciones - C.N.O.',
    'Funcion',
    'Funciones - C.N.O.',
    'Denominaciones - C.N.O.',
    'Relacionadas - C.N.O.',
    'Habilidades - C.N.O.',
    'Conocimientos - C.N.O.',
  ],
  completa: HOJAS_PLANTILLA_CNO.map((h) => h.nombre),
};
