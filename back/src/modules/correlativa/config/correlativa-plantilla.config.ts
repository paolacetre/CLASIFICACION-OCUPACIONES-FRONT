import { HojaPlantilla } from '../../../common/utils/plantilla-excel.util';
import { TipoCarga } from '../services/correlativa-carga.service';

/**
 * Plantilla del cargue de correlativas por tipo. Cada encabezado, ya
 * normalizado, es el primer alias de su columna en `COLUMNAS` de
 * `correlativa-carga.service.ts` (y del espejo del frontend), así que se
 * reconoce sin ambigüedad. `id` no se incluye: la base lo asigna.
 */

const SI_NO = 'Escribe 1 / sí / activo, o 0 / no / inactivo.';

export const PLANTILLAS_CORRELATIVA: Record<TipoCarga, HojaPlantilla> = {
  denominacion: {
    nombre: 'Correlativa denominación',
    columnas: [
      { encabezado: 'Código ocupación CNO', obligatoria: true, nota: 'Código de 4 dígitos, como texto (0011).' },
      { encabezado: 'Código denominación CNO', obligatoria: true },
      { encabezado: 'Descripción denominación CNO', obligatoria: false },
      { encabezado: 'Código ocupación CUOC', obligatoria: true, nota: 'Código de 5 dígitos, como texto (01100).' },
      { encabezado: 'Código denominación CUOC', obligatoria: true, nota: 'Debe existir en CUOC, por ejemplo 01100.001.' },
      { encabezado: 'Descripción denominación CUOC', obligatoria: false },
      { encabezado: 'Estado', obligatoria: false, nota: SI_NO },
      { encabezado: 'Observación', obligatoria: false },
    ],
  },
  ocupacion: {
    nombre: 'Correlativa ocupación',
    columnas: [
      { encabezado: 'Código ocupación CNO', obligatoria: true, nota: 'Código de 4 dígitos, como texto (0011).' },
      { encabezado: 'Nombre ocupación CNO', obligatoria: false },
      { encabezado: 'Código ocupación CUOC', obligatoria: true, nota: 'Código de 5 dígitos, como texto (01100).' },
      { encabezado: 'Nombre ocupación CUOC', obligatoria: false },
      { encabezado: 'Observación', obligatoria: false },
    ],
  },
  conocimiento: {
    nombre: 'Correlativa conocimiento',
    columnas: [
      { encabezado: 'Código conocimiento CNO', obligatoria: true, nota: 'Código numérico del conocimiento CNO.' },
      { encabezado: 'Nombre conocimiento CNO', obligatoria: false },
      { encabezado: 'Código conocimiento CUOC', obligatoria: true, nota: 'Código numérico del conocimiento CUOC.' },
      { encabezado: 'Nombre conocimiento CUOC', obligatoria: false },
      { encabezado: 'Aplica', obligatoria: false, nota: `${SI_NO} Si se deja vacía se guarda como 0.` },
    ],
  },
};
