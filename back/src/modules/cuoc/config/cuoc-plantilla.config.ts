import { ColumnaPlantilla, HojaPlantilla } from '../../../common/utils/plantilla-excel.util';
import { TipoCargaCuoc } from './cuoc-carga.config';

/**
 * Plantilla del cargue CUOC. Hojas y encabezados del libro oficial
 * (`Perfiles_Ocupacionales_CUOC_2025.xlsx`), que es el formato para el que se
 * escribió `CuocBulkUploadService`. Se omite «Equivalencias», que ningún
 * cargador lee. A diferencia de CNO, casi todas las hojas traen una fila por
 * ocupación: el código de la ocupación es lo que las enlaza.
 */

const CON_CEROS = 'Escríbelo como texto para conservar los ceros a la izquierda (01100, no 1100).';

const OCUPACION_REFERENCIA: ColumnaPlantilla[] = [
  { encabezado: 'Código del Gran Grupo', obligatoria: false },
  { encabezado: 'Código de la Ocupación', obligatoria: true, nota: `Código de 5 dígitos. ${CON_CEROS}` },
  { encabezado: 'Nombre de la Ocupación', obligatoria: false },
];

export const HOJAS_PLANTILLA_CUOC: HojaPlantilla[] = [
  {
    nombre: 'Ocupación',
    columnas: [
      { encabezado: 'Código del Gran Grupo', obligatoria: false },
      { encabezado: 'Nombre del Gran Grupo', obligatoria: false },
      { encabezado: 'Código del Subgrupo Principal', obligatoria: false },
      { encabezado: 'Nombre del Subgrupo Principal', obligatoria: false },
      { encabezado: 'Código del Subgrupo', obligatoria: false },
      { encabezado: 'Nombre del Subgrupo', obligatoria: false },
      { encabezado: 'Código del Grupo Primario', obligatoria: false },
      { encabezado: 'Nombre del Grupo Primario', obligatoria: false },
      { encabezado: 'Código de la Ocupación', obligatoria: true, nota: `Código de 5 dígitos. ${CON_CEROS} No puede repetirse.` },
      { encabezado: 'Nombre de la Ocupación', obligatoria: true },
    ],
  },
  {
    nombre: 'Descripción',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'Descripción de la Ocupación', obligatoria: false },
    ],
  },
  {
    nombre: 'Funciones',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'Consecutivo de la Función', obligatoria: false, nota: 'Número de la función dentro de la ocupación: 1, 2, 3…' },
      { encabezado: 'Funciones de la Ocupación', obligatoria: true },
    ],
  },
  {
    nombre: 'Denominaciones',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'Código de la Denominación', obligatoria: true, nota: 'Por ejemplo 01100.001.' },
      { encabezado: 'Nombre de la Denominación', obligatoria: true },
    ],
  },
  {
    nombre: 'Nivel Competencia',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'Nivel de Competencia', obligatoria: true, nota: 'Número entero del 1 al 4.' },
    ],
  },
  {
    nombre: 'Conocimientos',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'ID', obligatoria: true, nota: 'Código numérico del conocimiento.' },
      { encabezado: 'Nombre del Conocimiento', obligatoria: true },
      { encabezado: 'Descripción del conocimiento', obligatoria: false },
    ],
  },
  {
    nombre: 'Destrezas',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'ID', obligatoria: true, nota: 'Código numérico de la destreza.' },
      { encabezado: 'Nombre de la Destreza', obligatoria: true },
    ],
  },
  {
    nombre: 'Ocupaciones Afines',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'Código de la Ocupación Afin', obligatoria: true, nota: CON_CEROS },
      { encabezado: 'Nombre de la Ocupación Afin', obligatoria: false },
    ],
  },
  {
    nombre: 'Área Cual. Principal',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'SIGLA', obligatoria: true, nota: 'Sigla del área, por ejemplo SEGU.' },
      { encabezado: 'Área de Cualificación Principal', obligatoria: true },
    ],
  },
  {
    nombre: 'Área Cual. Complementaria',
    columnas: [
      ...OCUPACION_REFERENCIA,
      { encabezado: 'SIGLA', obligatoria: true, nota: 'Sigla del área, por ejemplo COMP.' },
      { encabezado: 'Área de Cualificación Complementaria', obligatoria: true },
    ],
  },
];

export type PlantillaCuoc = TipoCargaCuoc | 'completa';

/**
 * Hojas de cada plantilla, según lo que lee `CuocBulkUploadService.procesarTipo`.
 * «ocupacion» necesita casi todo el libro: de Descripción, Nivel Competencia y
 * Área Cual. Principal saca la descripción, el nivel y el área de cada
 * ocupación, y carga además funciones, denominaciones, conocimientos,
 * destrezas y afines.
 */
export const HOJAS_POR_PLANTILLA_CUOC: Record<PlantillaCuoc, readonly string[]> = {
  nivel: ['Nivel Competencia'],
  area: ['Área Cual. Principal', 'Área Cual. Complementaria'],
  habilidades: ['Destrezas'],
  conocimientos: ['Conocimientos'],
  ocupacion: [
    'Ocupación',
    'Descripción',
    'Funciones',
    'Denominaciones',
    'Nivel Competencia',
    'Conocimientos',
    'Destrezas',
    'Ocupaciones Afines',
    'Área Cual. Principal',
  ],
  completa: HOJAS_PLANTILLA_CUOC.map((h) => h.nombre),
};
