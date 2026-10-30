/**
 * Qué hoja y qué columnas espera cada tipo de carga guiada de CNO.
 *
 * Es la contraparte de `back/src/modules/cuoc/config/cuoc-carga.config.ts`
 * (mismo shape, mismo propósito): permite validar el archivo ANTES de
 * escribir nada, y es la fuente de verdad que consulta
 * `CnoCargaValidacionService`. Los alias de columna NO se inventan aquí:
 * salen literalmente de los `getColumnCode`/`getColumnStr` que ya usa
 * `cno-bulk-upload.service.ts` para cada hoja (`cargarAreaDesempeno`,
 * `cargarNivelCualificacion`, `cargarHabilidadCatalogo`,
 * `cargarConocimientoCatalogo`, `cargarOcupaciones`). Si se agrega un alias
 * nuevo, va en los dos lados (aquí y en el frontend
 * `front/src/app/features/cno/cno-carga.config.ts`).
 */

export type TipoCargaCno = 'nivel' | 'area' | 'habilidades' | 'conocimientos' | 'ocupacion';

export const TIPOS_CARGA_CNO: readonly TipoCargaCno[] = [
  'nivel',
  'area',
  'habilidades',
  'conocimientos',
  'ocupacion',
];

export interface ColumnaCargaCno {
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

export interface DefinicionTipoCno {
  etiqueta: string;
  /** Nombres de hoja aceptados, en el mismo orden que usa el importador. */
  hojas: string[];
  tabla: string;
  columnas: ColumnaCargaCno[];
}

/** Minúsculas, sin tildes, sin signos, espacios colapsados. Igual que en CUOC. */
export function normalizarEncabezado(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alias(...valores: string[]): string[] {
  return valores.map(normalizarEncabezado);
}

export const DEFINICIONES_CNO: Record<TipoCargaCno, DefinicionTipoCno> = {
  nivel: {
    etiqueta: 'Nivel de cualificación',
    hojas: ['nivel_cualificacion', 'Nivel de cualificacion', 'Nivel de cualificación', 'Area_cualificacion'],
    tabla: 'cno_nivel_cualificacion',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de cualificación',
        alias: alias('cod_cualificacion_cno'),
        requerida: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Nivel de cualificación',
        alias: alias('niveles_cualificacion_cno', 'nombre_cno'),
        requerida: true,
      },
      {
        clave: 'descripcion',
        etiqueta: 'Descripción',
        alias: alias('descripcion', 'Descripción'),
        requerida: false,
      },
    ],
  },

  area: {
    etiqueta: 'Área de desempeño',
    hojas: ['Area_desempeno', 'Area_desempeño', 'Area de desempeno', 'Area de desempeño'],
    tabla: 'cno_area_desempeno',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de desempeño',
        alias: alias('cod_desempeno_cno'),
        requerida: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Área de desempeño',
        alias: alias('nom_desempeno_cno'),
        requerida: true,
      },
      {
        clave: 'descripcion',
        etiqueta: 'Descripción',
        alias: alias('desc_desempeno_cno', 'descripcion', 'Descripción'),
        requerida: false,
      },
    ],
  },

  habilidades: {
    etiqueta: 'Habilidades',
    hojas: ['Habilidad', 'Habilidades', 'Habilidades - C.N.O.'],
    tabla: 'habilidad_destreza',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de la habilidad',
        alias: alias('cod_hab_dest'),
        requerida: true,
        numerica: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre de la habilidad',
        alias: alias('nomb_hab_dest'),
        requerida: true,
      },
      {
        clave: 'descripcion',
        etiqueta: 'Descripción',
        alias: alias('desc_hab_dest', 'descripcion', 'Descripción'),
        requerida: false,
      },
    ],
  },

  conocimientos: {
    etiqueta: 'Conocimientos',
    hojas: ['Nivel de conocimiento', 'Nivel_conocimiento', 'Nivel conocimiento', 'Conocimientos', 'Conocimiento'],
    tabla: 'cno_conocimiento',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código del conocimiento',
        alias: alias('cod_conocimiento_cno'),
        requerida: true,
        numerica: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre del conocimiento',
        alias: alias('nomb_conocimiento_cno'),
        requerida: true,
      },
      {
        clave: 'descripcion',
        etiqueta: 'Descripción',
        alias: alias('desc_conocimiento_cno', 'descripcion', 'Descripción'),
        requerida: false,
      },
    ],
  },

  ocupacion: {
    etiqueta: 'Ocupación',
    hojas: ['Ocupaciones - C.N.O.', 'Ocupaciones CNO', 'Ocupaciones', 'Ocupacion'],
    tabla: 'cno_ocupacion',
    columnas: [
      {
        clave: 'codigo',
        etiqueta: 'Código de la ocupación',
        alias: alias('cod_ocupacion_cno'),
        requerida: true,
        clavePrimaria: true,
      },
      {
        clave: 'nombre',
        etiqueta: 'Nombre de la ocupación',
        alias: alias('nomb_ocupacion_cno'),
        requerida: true,
      },
      {
        clave: 'area',
        etiqueta: 'Código de área de desempeño',
        alias: alias('cod_desempeno_cno', 'cod_desempe_cno'),
        requerida: false,
      },
      {
        clave: 'nivel',
        etiqueta: 'Código de nivel de cualificación',
        alias: alias('cod_cualificacion_cno'),
        requerida: false,
      },
      // Estas también las lee `cargarOcupaciones`; sin listarlas aquí, la
      // validación las mostraba como «no se cargará» aunque sí se guardaban.
      {
        clave: 'descripcion',
        etiqueta: 'Descripción de la ocupación',
        alias: alias('desc_ocupacion_cno'),
        requerida: false,
      },
      {
        clave: 'campo',
        etiqueta: 'Campo ocupacional',
        alias: alias('campo_ocupacional', 'campo_ocup_cno'),
        requerida: false,
      },
      {
        clave: 'descCampo',
        etiqueta: 'Descripción del campo ocupacional',
        alias: alias('descripcion_campo', 'desc_campo_ocup_cno'),
        requerida: false,
      },
      {
        clave: 'estado',
        etiqueta: 'Estado (activa)',
        alias: alias('activa_ocupacion_cno', 'estado'),
        requerida: false,
      },
    ],
  },
};

export function esTipoCargaCno(valor: string): valor is TipoCargaCno {
  return (TIPOS_CARGA_CNO as readonly string[]).includes(valor);
}
