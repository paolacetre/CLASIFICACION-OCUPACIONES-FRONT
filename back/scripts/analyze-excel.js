const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, '..', 'documentos', '2CNO_2024_(2025-06-13).xlsx');
const workbook = XLSX.readFile(filePath);

let output = '';

output += '=== PESTAÑAS ENCONTRADAS ===\n';
workbook.SheetNames.forEach((name, i) => {
  output += `  ${i + 1}. "${name}"\n`;
});

// Specifically analyze "Ocupaciones - C.N.O (2)" for the conocimientos relationship
const possibleNames = workbook.SheetNames.filter(n => n.toLowerCase().includes('ocupacion'));
output += `\nPestañas con "ocupacion": ${possibleNames.join(', ')}\n`;

const ocup2Name = workbook.SheetNames.find(n => n.includes('C.N.O (2)') || n.includes('C.N.O. (2)'));
output += `\nPestaña "Ocupaciones - C.N.O (2)" encontrada como: "${ocup2Name}"\n`;

if (ocup2Name) {
  const ws = workbook.Sheets[ocup2Name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  output += `Total filas: ${rows.length}\n`;
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    output += `Columnas: ${JSON.stringify(cols)}\n`;
    output += `Primera fila: ${JSON.stringify(rows[0])}\n`;
    output += `Segunda fila: ${JSON.stringify(rows[1])}\n`;
  }
  
  // Check unique occupation codes vs total rows
  const ocupCodes = new Set();
  const conocMap = new Map();
  rows.forEach(r => {
    const colNames = Object.keys(r);
    const codOcupCol = colNames.find(c => c.includes('Código de la ocupación'));
    const codConocCol = colNames.find(c => c.includes('Código del conocimiento'));
    const codOcup = codOcupCol ? r[codOcupCol] : null;
    const codConoc = codConocCol ? r[codConocCol] : null;
    if (codOcup) ocupCodes.add(codOcup);
    if (codOcup && codConoc) {
      if (!conocMap.has(codOcup)) conocMap.set(codOcup, []);
      conocMap.get(codOcup).push(codConoc);
    }
  });
  output += `\nOcupaciones únicas: ${ocupCodes.size}\n`;
  output += `Ocupaciones con conocimientos: ${conocMap.size}\n`;
  
  let count = 0;
  for (const [codOcup, conocs] of conocMap) {
    if (conocs.length > 1 && count < 10) {
      output += `  Ocupación ${codOcup} tiene ${conocs.length} conocimientos: ${conocs.join(', ')}\n`;
      count++;
    }
  }
  
  let maxConoc = 0;
  for (const [, conocs] of conocMap) {
    if (conocs.length > maxConoc) maxConoc = conocs.length;
  }
  output += `Máximo conocimientos por ocupación: ${maxConoc}\n`;
} else {
  output += 'Pestaña no encontrada\n';
}

// Also check the "Ocupaciones - C.N.O." sheet (original)
const ocup1Name = 'Ocupaciones - C.N.O.';
if (workbook.Sheets[ocup1Name]) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[ocup1Name], { defval: '' });
  output += `\n=== Pestaña "${ocup1Name}" ===\n`;
  output += `Filas: ${rows.length}\n`;
  if (rows.length > 0) {
    output += `Columnas: ${JSON.stringify(Object.keys(rows[0]))}\n`;
  }
}

// Check "Conocimientos - C.N.O." for the relationship data
const conocName = 'Conocimientos - C.N.O.';
if (workbook.Sheets[conocName]) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[conocName], { defval: '' });
  output += `\n=== Pestaña "${conocName}" ===\n`;
  output += `Filas: ${rows.length}\n`;
  
  // Check if conocimientos are linked to occupaciones
  const conocCodes = new Set();
  rows.forEach(r => {
    const codConoc = r['Código del conocimiento - C.N.O.'];
    if (codConoc) conocCodes.add(codConoc);
  });
  output += `Conocimientos únicos: ${conocCodes.size}\n`;
}

// Check Area_cualificacion and Area_desempeño
const areaDesName = workbook.SheetNames.find(n => n.toLowerCase().includes('area_desem'));
if (areaDesName) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[areaDesName], { defval: '' });
  output += `\n=== "${areaDesName}" ===\n`;
  output += `Filas: ${rows.length}\n`;
  output += `Columnas: ${JSON.stringify(Object.keys(rows[0]))}\n`;
}

const areaCualName = workbook.SheetNames.find(n => n.toLowerCase().includes('area_cualif'));
if (areaCualName) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[areaCualName], { defval: '' });
  output += `\n=== "${areaCualName}" ===\n`;
  output += `Filas: ${rows.length}\n`;
  output += `Columnas: ${JSON.stringify(Object.keys(rows[0]))}\n`;
}

fs.writeFileSync(path.join(__dirname, 'excel-analysis.txt'), output);
console.log(output);
