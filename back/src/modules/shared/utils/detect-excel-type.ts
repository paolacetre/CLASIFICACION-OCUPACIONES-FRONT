import * as XLSX from 'xlsx';

/**
 * Analiza el buffer de un archivo Excel y determina si es de clasificación CNO o CUOC
 * basándose en los nombres de las pestañas y la longitud de los códigos ocupacionales
 * (4 caracteres para CNO, 5 caracteres para CUOC).
 */
export function detectExcelType(buffer: Buffer): 'CNO' | 'CUOC' {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // 1. Detección rápida basada en el nombre de las pestañas
  const sheetNames = workbook.SheetNames;
  const isCnoSheet = sheetNames.some(name => {
    const sn = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return sn.includes('c.n.o') || sn.includes('cno');
  });
  
  const isCuocSheet = sheetNames.some(name => {
    const sn = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return sn.includes('cuoc') || sn.includes('jerarquia') || sn.includes('destrezas') || sn.includes('competencia');
  });

  // 2. Detección profunda analizando la pestaña de ocupaciones y la longitud de los códigos
  const candidates = [
    'Ocupaciones - C.N.O. ', 'Ocupaciones - C.N.O.', 'Ocupaciones CNO', 'Ocupaciones',
    'ocupaciones'
  ];
  
  let ws: XLSX.WorkSheet | undefined;
  for (const name of candidates) {
    if (workbook.Sheets[name]) {
      ws = workbook.Sheets[name];
      break;
    }
  }
  
  if (!ws) {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const sheetName of workbook.SheetNames) {
      const sn = norm(sheetName);
      if (sn.includes('ocupacion')) {
        ws = workbook.Sheets[sheetName];
        break;
      }
    }
  }
  
  // Si no hay pestaña de ocupaciones, recurrimos a la primera pestaña
  if (!ws && sheetNames.length > 0) {
    ws = workbook.Sheets[sheetNames[0]];
  }

  if (!ws || !ws['!ref']) {
    // Si sigue sin haber hoja, tomamos la decisión basándonos en los nombres de pestañas
    if (isCnoSheet && !isCuocSheet) return 'CNO';
    return 'CUOC'; // Por defecto
  }

  try {
    // Encontrar fila de cabecera
    const ref = ws['!ref'];
    const range = XLSX.utils.decode_range(ref);
    const keywords = ['codigo', 'código', 'cod_ocupacion', 'nom_ocupacion', 'nombre_ocupacion'];
    let headerRow = range.s.r;
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 25); r++) {
      let rowText = '';
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell?.v) rowText += String(cell.v).toLowerCase() + ' ';
      }
      if (keywords.some((k) => rowText.includes(k))) {
        headerRow = r;
        break;
      }
    }
    
    // Buscar la columna del código de ocupación prioritariamente
    let codeColIndex = -1;
    const priorityKeywords = ['cod_ocupacion', 'codigo_ocupacion', 'codigo de la ocupacion', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'cod_ocupacion_cno'];
    
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
      if (cell?.v) {
        const valStr = String(cell.v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '');
        if (priorityKeywords.some(kw => valStr.includes(kw.replace(/[^a-z0-9_]/g, '')))) {
          codeColIndex = c;
          break;
        }
      }
    }

    // Si no se encontró, buscar cualquier columna que contenga 'cod' o 'codigo' o 'código'
    if (codeColIndex === -1) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
        if (cell?.v) {
          const valStr = String(cell.v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (valStr.includes('cod') || valStr.includes('codigo') || valStr.includes('código')) {
            codeColIndex = c;
            break;
          }
        }
      }
    }

    if (codeColIndex !== -1) {
      let total4 = 0;
      let total5 = 0;
      const maxRowsToInspect = Math.min(range.e.r, headerRow + 80);

      for (let row = headerRow + 1; row <= maxRowsToInspect; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: codeColIndex });
        const cellValue = ws[cellAddress]?.v;
        if (cellValue != null && cellValue !== '') {
          const digits = String(cellValue).replace(/\D/g, '');
          if (digits.length > 0) {
            const numValue = parseInt(digits, 10);
            if (!isNaN(numValue)) {
              if (numValue < 10000 || digits.length === 4) {
                total4++;
              } else if ((numValue >= 10000 && numValue < 100000) || digits.length === 5) {
                total5++;
              }
            }
          }
        }
      }

      if (total4 > total5) return 'CNO';
      if (total5 > total4) return 'CUOC';
    }
  } catch (err) {
    // Si algo falla al parsear, caemos en la detección por nombres de pestañas
  }

  if (isCnoSheet && !isCuocSheet) return 'CNO';
  return 'CUOC';
}
