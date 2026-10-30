import { BadRequestException, Logger } from '@nestjs/common';
import { MulterModuleOptions } from '@nestjs/platform-express';

/**
 * El filtro de Multer solo mira el tipo MIME que declara el navegador, y ese
 * dato lo pone quien sube el archivo. Un PDF o un texto renombrado a .xlsx
 * pasaba el filtro, la librería XLSX lo "leía" como una hoja de texto y la
 * carga respondía 200 "completada, 0 insertados", como si todo hubiera ido
 * bien. Aquí se mira la firma real del contenido:
 *   .xlsx → ZIP  (50 4B 03 04, "PK")
 *   .xls  → OLE2 (D0 CF 11 E0)
 */
const FIRMAS_EXCEL = [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0xd0, 0xcf, 0x11, 0xe0])];

export function exigirFirmaExcel(buffer: Buffer | undefined): void {
  const esExcel = !!buffer && FIRMAS_EXCEL.some((firma) => buffer.subarray(0, firma.length).equals(firma));
  if (!esExcel) {
    throw new BadRequestException('El archivo no es un Excel válido (.xlsx o .xls) o está dañado.');
  }
}

const MIMES_EXCEL = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/** Opciones de `FileInterceptor` para los endpoints que reciben un Excel: 50 MB y solo MIME de Excel. */
export const OPCIONES_MULTER_EXCEL: MulterModuleOptions = {
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_EXCEL.includes(file.mimetype)) {
      cb(new BadRequestException('Solo se permiten archivos Excel (.xlsx o .xls)'), false);
      return;
    }
    cb(null, true);
  },
};

/** Exige que haya llegado el campo "file" y que su contenido sea de verdad un Excel. */
export function exigirArchivoExcel(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('No se recibió ningún archivo. Envíe un campo "file" con el Excel.');
  }
  exigirFirmaExcel(file.buffer);
}

/**
 * Esquema Swagger del multipart de validar/cargar por tipo: el archivo y el
 * JSON opcional con las correcciones hechas en «Configurar».
 */
export const ESQUEMA_ARCHIVO_CON_MAPEO = {
  type: 'object',
  properties: {
    file: { type: 'string', format: 'binary' },
    mapeoManual: {
      type: 'string',
      description:
        'JSON opcional {"encabezado del archivo": "clave del campo"} con las correcciones manuales hechas en «Configurar».',
    },
  },
  required: ['file'],
};

/** JSON inválido o ausente se trata como "sin correcciones", no como error: es un campo opcional. */
export function parsearMapeoManual(raw: string | undefined, logger: Logger): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    logger.warn('mapeoManual recibido no es JSON válido, se ignora.');
  }
  return undefined;
}

const normalizarNombreHoja = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Hoja que leerá el cargador: la primera candidata con ese nombre exacto y, si
 * no hay, la primera cuyo nombre coincida sin tildes, espacios ni signos. Es el
 * mismo criterio de `findSheetName` (CNO) y `findSheet` (CUOC).
 */
export function hojaQueLeeElCargue(nombresHojas: string[], candidatas: readonly string[]): string | null {
  for (const candidata of candidatas) {
    if (nombresHojas.includes(candidata)) return candidata;
  }
  const normalizadas = candidatas.map(normalizarNombreHoja);
  return nombresHojas.find((h) => normalizadas.includes(normalizarNombreHoja(h))) ?? null;
}

/**
 * La validación encuentra los datos por sus COLUMNAS, en cualquier hoja; el
 * cargue, en cambio, busca la hoja por su NOMBRE. Si no coinciden, validar
 * decía «listo para cargar» y la carga terminaba sin insertar nada. Devuelve
 * el motivo exacto para mostrarlo y bloquear la carga, o null si coinciden.
 */
export function avisoNombreDeHoja(
  nombresHojas: string[],
  hojaConDatos: string,
  candidatas: readonly string[],
  etiquetaTipo: string,
): string | null {
  const hojaLeida = hojaQueLeeElCargue(nombresHojas, candidatas);
  if (hojaLeida === hojaConDatos) return null;

  if (hojaLeida === null) {
    const otros = candidatas.slice(1).map((c) => `«${c}»`).join(', ');
    return (
      `Los datos están en la hoja «${hojaConDatos}», pero el cargue de «${etiquetaTipo}» solo lee la hoja ` +
      `llamada «${candidatas[0]}»${otros ? ` (también acepta ${otros})` : ''}. ` +
      'Cambia el nombre de la hoja o usa la plantilla.'
    );
  }
  return (
    `El cargue de «${etiquetaTipo}» leería la hoja «${hojaLeida}», pero sus columnas están en «${hojaConDatos}». ` +
    `Pasa los datos a «${hojaLeida}» o elimina esa hoja del archivo.`
  );
}
