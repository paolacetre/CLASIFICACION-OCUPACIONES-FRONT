const XLSX = require('xlsx');
const path = require('path');

const file = __dirname + '/../../CUOCDB/correlativa.xlsx';
const wb = XLSX.readFile(file);
console.log('Sheet Names:', wb.SheetNames);

for (const name of wb.SheetNames) {
  console.log(`\n--- Sheet: ${name} ---`);
  const ws = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log('Total Rows:', json.length);
  console.log('Headers (Row 0):', json[0]);
  console.log('Headers (Row 1):', json[1]);
  console.log('Sample Data (Row 2):', json[2]);
  console.log('Sample Data (Row 3):', json[3]);
}
