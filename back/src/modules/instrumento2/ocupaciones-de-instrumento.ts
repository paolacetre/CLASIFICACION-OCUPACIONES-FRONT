import { Instrumento } from './entities/instrumento.entity';

/**
 * Códigos de las copias de ocupación que agrupa un instrumento, en el orden en
 * que se validan y se reportan: primero los slots CNO (principal, 2, 3) y luego
 * los CUOC, sin repetir.
 *
 * Vive aparte porque Instrumento 2 (snapshot y detalle) y Resumen (agrupación
 * de las respuestas) tienen que coincidir EXACTAMENTE en qué ocupaciones son y
 * en qué orden; con la regla duplicada, un cambio en uno solo de los lados
 * desalineaba el reporte con lo que el experto validó.
 *
 * Si el instrumento no tiene comparativa (filas antiguas), la única ocupación
 * es la del propio instrumento.
 */
export function codigosOcupacionesDeInstrumento(row: Instrumento): string[] {
  const codes: string[] = [];
  const co = row.comparativaOcupacion;
  if (co) {
    const rawCodes = [
      co.ocupacionCno?.codOcupacionCno ?? (co as any).cod_ocupacion_cno,
      co.codOcupacionCno2,
      co.codOcupacionCno3,
      co.ocupacionCuoc?.codOcupacionCuoc ?? (co as any).cod_ocupacion_cuoc,
      co.codOcupacionCuoc2,
      co.codOcupacionCuoc3,
    ];
    for (const c of rawCodes) {
      if (c && typeof c === 'string' && c.trim()) {
        const trimmed = c.trim();
        if (!codes.includes(trimmed)) {
          codes.push(trimmed);
        }
      }
    }
  }
  if (codes.length === 0 && row.ocupacion) {
    codes.push(row.ocupacion.trim());
  }
  return codes;
}

/** Catálogo del que viene una ocupación de la agrupación, según el slot que ocupa. */
export function panelDeOcupacion(row: Instrumento, codigo: string): 'CNO' | 'CUOC' {
  const co = row.comparativaOcupacion;
  if (!co) return 'CNO';
  const cuoc = [co.ocupacionCuoc?.codOcupacionCuoc, co.codOcupacionCuoc2, co.codOcupacionCuoc3]
    .map((c) => c?.trim())
    .filter(Boolean);
  const cno = [co.ocupacionCno?.codOcupacionCno, co.codOcupacionCno2, co.codOcupacionCno3]
    .map((c) => c?.trim())
    .filter(Boolean);
  if (cno.includes(codigo)) return 'CNO';
  return cuoc.includes(codigo) ? 'CUOC' : 'CNO';
}

/**
 * Código de la ocupación REAL del catálogo a partir del de su copia.
 *
 * La copia es `${original}-${comparativa}[-${panel}]`, así que el corte se hace
 * contra el código de la comparativa. Si no coincide (registros históricos con
 * un serial desfasado) se corta en el primer guion: ningún código real del
 * catálogo lleva guion, el guion solo aparece en el sufijo que agrega Análisis.
 */
export function codigoRealDeCopia(codigo: string | null | undefined, comparativa?: number | null): string {
  if (!codigo) return '';

  if (comparativa !== null && comparativa !== undefined) {
    const sufijo = `-${comparativa}`;

    // Primero el formato actual `original-comparativa-panel`. Si se probara
    // antes `original-comparativa`, una copia cuyo panel coincide con el
    // número de la comparativa ("1123-3-3") perdía solo el panel: "1123-3".
    const ultimoGuion = codigo.lastIndexOf('-');
    if (ultimoGuion > 0) {
      const indicePanel = codigo.slice(ultimoGuion + 1);
      const sinIndice = codigo.slice(0, ultimoGuion);
      if (/^[0-9]+$/.test(indicePanel) && sinIndice.endsWith(sufijo)) {
        return sinIndice.slice(0, -sufijo.length);
      }
    }

    if (codigo.endsWith(sufijo)) return codigo.slice(0, -sufijo.length);
  }

  const base = codigo.split('-')[0];
  return base || codigo;
}

/**
 * Ocupación a la que se atribuye un ítem o un veredicto guardado. NULL (datos
 * anteriores a la migración 028) significa la principal del instrumento.
 */
export function ocupacionDeItem(codOcupacion: string | null | undefined, row: Instrumento): string {
  const propia = codOcupacion?.trim();
  if (propia) return propia;
  return (row.ocupacion ?? '').trim();
}
