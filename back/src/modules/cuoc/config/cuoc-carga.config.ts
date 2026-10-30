/**
 * Qué hoja y qué columnas espera cada tipo de carga CUOC.
 *
 * Los nombres de hoja y los alias de columna NO se inventan aquí: salen de los
 * `findSheet([...])` y `pick(row, [...])` que ya usa `cuoc-bulk-upload.service.ts`
 * al importar (que lee `hojas` de aquí mismo para los cinco tipos).
 *
 * Se aceptan dos formatos de libro: la plantilla oficial («Nivel Competencia»,
 * «Ocupación»…) y el export por tablas de la BD («cuoc_niveles_competencia»,
 * «cuoc_ocupaciones»…, como «CUOC Actualizado 2026.xlsx»). Esta configuración es lo que permite validar el archivo ANTES de
 * escribir nada, y es la contraparte de `front/src/app/features/cuoc/cuoc-carga.config.ts`.
 * Si se agrega un alias, va en los dos lados.
 */

export type TipoCargaCuoc = 'nivel' | 'area' | 'habilidades' | 'conocimientos' | 'ocupacion';

export const TIPOS_CARGA_CUOC: readonly TipoCargaCuoc[] = [
  'nivel',
  'area',
  'habilidades',
  'conocimientos',
  'ocupacion',
];

export interface ColumnaCargaCuoc {
  clave: string;
  /** Nombre que se le muestra al usuario en la validación de columnas. */
  etiqueta: string;
  /** Encabezados aceptados, ya normalizados (minúsculas, sin tildes ni signos). */
  alias: string[];
  requerida: boolean;
  /** Si la columna debe contener un número entero. */
  numerica?: boolean;
  /** Si el valor identifica la fila y no puede repetirse dentro del archivo. */
  clavePrimaria?: boolean;
}

export interface DefinicionTipoCuoc {
  etiqueta: string;
  /** Nombres de hoja aceptados, en el mismo orden que usa el importador. */
  hojas: string[];
  tabla: string;
  columnas: ColumnaCargaCuoc[];
}

/** Minúsculas, sin tildes, sin signos, espacios colapsados. */
export function normalizarEncabezado(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aplica `normalizarEncabezado` a cada alias declarado, para comparar de forma estable. */
function alias(...valores: string[]): string[] {
  return valores.map(normalizarEncabezado);
}

export const DEFINICIONES_CUOC: Record<TipoCargaCuoc, DefinicionTipoCuoc> = {
  nivel: {
    etiqueta: 'Nivel',
    hojas: [
      'Nivel Competencia',
      'Niveles de competencia',
      'Niveles de competencia - C.U.O.C.',
      'nivel_competencia',
      'Nivel Competencia CUOC',
      'cuoc_niveles_competencia',
      'cuoc_nivel_competencia',
    ],
    tabla: 'cuoc_nivel_competencia',
    columnas: [
      {
        clave: 'nivel',
        etiqueta: 'Nivel de competencia',
        alias: alias('Nivel de Competencia', 'nivel_competencia', 'nivel', 'cod_nivel', 'cod_niveles_competencia_cuoc'),
        requerida: true,
        numerica: true,
        // SIN clavePrimaria: la hoja oficial trae una fila por OCUPACIÓN, no
        // por nivel — el mismo nivel (1 a 4) se repite en cientos de filas.
        // `processNivelesCompetencia` ya deduplica con un Set antes de
        // escribir; marcar esto como clave única disparaba un "duplicado" en
        // casi todas las filas.
      },
      {
        // Solo la trae el export por tablas (catálogo, una fila por nivel).
        clave: 'descripcion',
        etiqueta: 'Descripción del nivel',
        alias: alias('nom_niveles_competencia_cuoc', 'Descripción del nivel', 'descripcion_nivel'),
        requerida: false,
      },
    ],
  },

  area: {
    etiqueta: 'Área de cualificación',
    hojas: [
      'Área Cual. Principal',
      'Area Cual. Principal',
      'Área de cualificación - C.U.O.C.',
      'Área de cualificación',
      'Area de cualificacion',
      'area_cualificacion',
      'Area Cualificacion CUOC',
      'cuoc_area_cualificacion',
    ],
    tabla: 'cuoc_area_cualificacion',
    columnas: [
      {
        clave: 'sigla',
        etiqueta: 'Sigla',
        // `cod_area_cualifi_cuoc` antes que `codigo`: en el export por tablas
        // `codigo` es el id numérico de la fila, no la sigla.
        alias: alias('SIGLA', 'sigla', 'cod_area_cualifi_cuoc', 'codigo', 'Código'),
        requerida: true,
        // SIN clavePrimaria: una fila por ocupación, la sigla del área se
        // repite en todas las que comparten esa área. `processAreaCualificacion`
        // deduplica por sigla antes de insertar.
      },
      {
        clave: 'nombre',
        etiqueta: 'Área de cualificación',
        alias: alias(
          'Área de Cualificación Principal',
          'Area de Cualificacion Principal',
          'nombre',
          'Nombre',
          'nom_area',
          'nom_cualificacion',
          'desc_area_cualifi_cuoc',
        ),
        requerida: true,
      },
    ],
  },

  habilidades: {
    etiqueta: 'Habilidades',
    hojas: [
      'Destrezas - C.U.O.C.',
      'Destrezas',
      'destrezas_cuoc',
      'Habilidades - C.U.O.C.',
      'Habilidades',
      // El export por tablas no trae catálogo aparte: el nombre de cada
      // destreza viene en su relación con la ocupación.
      'cuoc_reg_destrezas',
      'cuoc_destrezas',
    ],
    tabla: 'habilidad_destreza',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de la destreza',
        alias: alias('ID', 'id', 'cod_hab_dest', 'codigo_destreza', 'Código de la destreza', 'codigo'),
        requerida: true,
        numerica: true,
        // SIN clavePrimaria: una fila por relación ocupación-destreza; el
        // mismo ID de destreza aparece en cada ocupación que la requiere.
        // `processDestrezas` deduplica el catálogo antes de insertar.
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre de la destreza',
        alias: alias(
          'Nombre de la Destreza',
          'Nombre de la destreza',
          'nomb_hab_dest',
          'nombre_destreza',
          'nombre',
        ),
        requerida: true,
      },
    ],
  },

  conocimientos: {
    etiqueta: 'Conocimientos',
    // `cuoc_reg_conocimientos` NO va aquí: es la relación ocupación–conocimiento,
    // que lee `processRegConocimientos` al cargar «ocupacion».
    hojas: ['Conocimientos - C.U.O.C.', 'Conocimientos', 'conocimientos_cuoc', 'cuoc_conocimientos', 'cuoc_conocimiento'],
    tabla: 'cuoc_conocimiento',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código del conocimiento',
        alias: alias(
          'ID',
          'id',
          'cod_conocimiento',
          'Código del conocimiento',
          'codigo_conocimiento',
          'cod_conocimiento_cuoc',
        ),
        requerida: true,
        numerica: true,
        // SIN clavePrimaria: misma razón que destrezas — una fila por
        // relación ocupación-conocimiento. `processConocimientos` deduplica.
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre del conocimiento',
        alias: alias(
          'Nombre del Conocimiento',
          'Nombre del conocimiento',
          'nomb_conocimiento',
          'nombre_conocimiento',
          'nomb_conocimiento_cuoc',
        ),
        requerida: true,
      },
      {
        clave: 'descripcion',
        etiqueta: 'Descripción',
        alias: alias(
          'desc_conocimiento',
          'descripcion_conocimiento',
          'Descripción del conocimiento',
          'desc_conocimiento_cuoc',
        ),
        requerida: false,
      },
    ],
  },

  ocupacion: {
    etiqueta: 'Ocupación',
    hojas: [
      'Ocupación',
      'Ocupacion',
      'Ocupaciones',
      'Ocupaciones - C.U.O.C.',
      'Ocupaciones CUOC',
      'ocupaciones_cuoc',
      'cuoc_ocupaciones',
      'cuoc_ocupacion',
    ],
    tabla: 'cuoc_ocupacion',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de la ocupación',
        alias: alias(
          'Código de la Ocupación',
          'codigodelaocupacion',
          'cod_ocupacion_cuoc',
          'codigo',
          'Código',
          'Codigo',
          'cod_ocupacion',
        ),
        requerida: true,
        clavePrimaria: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre de la ocupación',
        alias: alias(
          'Nombre de la Ocupación',
          'nombredelaocupacion',
          'nom_ocupacion_cuoc',
          'nombre_ocupacion',
          'nombre',
          'Nombre',
        ),
        requerida: true,
      },
      {
        clave: 'grupoPrimario',
        etiqueta: 'Código del grupo primario',
        alias: alias(
          'Código del Grupo Primario',
          'codigodelgrupoprimario',
          'cod_grupo_prim',
          'cod_gp',
          'Grupo primario',
          'grupo_primario',
        ),
        requerida: false,
      },
      // El export por tablas trae en la misma fila lo que la plantilla oficial
      // reparte en las hojas Descripción, Nivel Competencia y Área Cual. Principal.
      {
        clave: 'descripcion',
        etiqueta: 'Descripción de la ocupación',
        alias: alias('Descripción de la Ocupación', 'desc_ocupacion_cuoc'),
        requerida: false,
      },
      {
        clave: 'nivelCompetencia',
        etiqueta: 'Nivel de competencia',
        alias: alias('Nivel de Competencia', 'cod_nivel_cuoc'),
        requerida: false,
      },
      {
        clave: 'areaCualificacion',
        etiqueta: 'Sigla del área de cualificación',
        alias: alias('area_cual', 'codigo_area_cuoc'),
        requerida: false,
      },
      {
        clave: 'estado',
        etiqueta: 'Estado',
        alias: alias('estado'),
        requerida: false,
      },
      // La jerarquía de la hoja Ocupación también se carga (`processJerarquia`);
      // sin listarla aquí, la validación la mostraba como «no se cargará».
      ...columnasJerarquia(),
    ],
  },
};

function columnasJerarquia(): ColumnaCargaCuoc[] {
  const opcional = (clave: string, etiqueta: string, ...valores: string[]): ColumnaCargaCuoc => ({
    clave,
    etiqueta,
    alias: alias(...valores),
    requerida: false,
  });
  return [
    opcional('granGrupo', 'Código del gran grupo', 'Código del Gran Grupo', 'cod_gran_grupo', 'cod_gg', 'Gran grupo'),
    opcional('nombreGranGrupo', 'Nombre del gran grupo', 'Nombre del Gran Grupo', 'nom_gran_grupo', 'nombre_gg', 'Nombre gran grupo', 'Gran grupo nombre'),
    opcional('subgrupoPrincipal', 'Código del subgrupo principal', 'Código del Subgrupo Principal', 'cod_subgrupo_p', 'cod_sp', 'Subgrupo principal'),
    opcional('nombreSubgrupoPrincipal', 'Nombre del subgrupo principal', 'Nombre del Subgrupo Principal', 'nom_subgrupo_p', 'nombre_sp', 'Nombre subgrupo principal', 'Subgrupo principal nombre'),
    opcional('subgrupo', 'Código del subgrupo', 'Código del Subgrupo', 'cod_subgrupo_c', 'cod_sg', 'Subgrupo'),
    opcional('nombreSubgrupo', 'Nombre del subgrupo', 'Nombre del Subgrupo', 'nom_subgrupo_c', 'nombre_sg', 'Nombre subgrupo', 'Subgrupo nombre'),
    opcional('nombreGrupoPrimario', 'Nombre del grupo primario', 'Nombre del Grupo Primario', 'nom_grupo_prim', 'nombre_gp', 'Nombre grupo primario', 'Grupo primario nombre'),
  ];
}

export function esTipoCargaCuoc(valor: string): valor is TipoCargaCuoc {
  return (TIPOS_CARGA_CUOC as readonly string[]).includes(valor);
}
