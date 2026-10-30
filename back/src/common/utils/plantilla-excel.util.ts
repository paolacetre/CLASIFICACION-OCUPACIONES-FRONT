import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

/**
 * Plantillas de Excel para los cargues. Una plantilla es un libro vacío con
 * las hojas y los encabezados exactos que lee el cargador correspondiente,
 * para que nadie tenga que adivinar el formato. No trae filas de ejemplo a
 * propósito: un ejemplo olvidado se cargaría como dato real.
 */

export interface ColumnaPlantilla {
  /** Encabezado exacto que se escribe en la fila 1 (y que el cargador reconoce). */
  encabezado: string;
  obligatoria: boolean;
  /** Regla de formato que se muestra como comentario de la celda del encabezado. */
  nota?: string;
}

export interface HojaPlantilla {
  /** Nombre de la hoja; varios cargadores la buscan por este nombre. */
  nombre: string;
  columnas: ColumnaPlantilla[];
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Libro .xlsx con una hoja por definición: solo la fila de encabezados, comentada. */
export function construirPlantillaExcel(hojas: HojaPlantilla[]): Buffer {
  const libro = XLSX.utils.book_new();

  for (const hoja of hojas) {
    const ws = XLSX.utils.aoa_to_sheet([hoja.columnas.map((c) => c.encabezado)]);

    hoja.columnas.forEach((columna, indice) => {
      const celda = ws[XLSX.utils.encode_cell({ r: 0, c: indice })];
      const texto = [columna.obligatoria ? 'OBLIGATORIA.' : 'Opcional.', columna.nota].filter(Boolean).join(' ');
      celda.c = [{ a: 'Sistema de Clasificación', t: texto }];
      (celda.c as unknown as { hidden: boolean }).hidden = true;
    });
    ws['!cols'] = hoja.columnas.map((c) => ({ wch: Math.max(14, c.encabezado.length + 4) }));

    XLSX.utils.book_append_sheet(libro, ws, hoja.nombre);
  }

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Escribe la plantilla como descarga, con el mismo patrón que los exportes. */
export function enviarPlantilla(res: Response, hojas: HojaPlantilla[], nombreArchivo: string): void {
  const buffer = construirPlantillaExcel(hojas);
  res.set({
    'Content-Type': MIME_XLSX,
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

/** Valida el `:tipo` de la ruta contra las plantillas que existen, con un mensaje que las lista. */
export function exigirPlantilla<T extends string>(tipo: string, disponibles: Record<T, unknown>): T {
  if (!Object.prototype.hasOwnProperty.call(disponibles, tipo)) {
    throw new BadRequestException(
      `No existe la plantilla "${tipo}". Plantillas disponibles: ${Object.keys(disponibles).join(', ')}.`,
    );
  }
  return tipo as T;
}

/** Selecciona, en orden, las hojas con esos nombres. */
export function hojasPorNombre(todas: HojaPlantilla[], nombres: readonly string[]): HojaPlantilla[] {
  return nombres.map((nombre) => {
    const hoja = todas.find((h) => h.nombre === nombre);
    if (!hoja) throw new Error(`La plantilla no define la hoja «${nombre}».`);
    return hoja;
  });
}
