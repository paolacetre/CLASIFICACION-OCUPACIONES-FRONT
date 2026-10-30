/**
 * Siembra puntual de las 3 correlativas (denominacion, ocupacion, conocimiento)
 * desde los CSV entregados, reutilizando el endpoint real de carga
 * (`POST /api/correlativa/upload/:tipo`) para no saltarse ninguna validacion
 * de catalogo/FK ni duplicar logica de negocio.
 *
 * Uso: SEED_LOGIN_USER=... SEED_LOGIN_PASS=... node scripts/seed-correlativa-from-csv.js
 * Requiere que el backend este corriendo en API_URL (por defecto :3000).
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const LOGIN_USER = process.env.SEED_LOGIN_USER;
const LOGIN_PASS = process.env.SEED_LOGIN_PASS;

if (!LOGIN_USER || !LOGIN_PASS) {
  console.error('Faltan credenciales: define SEED_LOGIN_USER y SEED_LOGIN_PASS antes de ejecutar el script.');
  process.exit(1);
}

const ARCHIVOS = [
  { tipo: 'denominacion', csv: path.resolve(__dirname, '..', '..', 'correlativa_denominacion.csv') },
  { tipo: 'ocupacion', csv: path.resolve(__dirname, '..', '..', 'correlativa_ocupacion.csv') },
  { tipo: 'conocimiento', csv: path.resolve(__dirname, '..', '..', 'correlativa_conocimientos.csv') },
];

/** Parser CSV minimo: separador ';', soporta campos entre comillas dobles. */
function parseCsv(texto) {
  const lineas = texto.split(/\r\n|\n/).filter((l) => l.length > 0);
  return lineas.map((linea) => {
    const campos = [];
    let actual = '';
    let entreComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (entreComillas && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = !entreComillas;
        }
      } else if (c === ';' && !entreComillas) {
        campos.push(actual);
        actual = '';
      } else {
        actual += c;
      }
    }
    campos.push(actual);
    return campos.map((c) => c.trim());
  });
}

function csvToXlsxBuffer(csvPath) {
  const texto = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const filas = parseCsv(texto);
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
  return { buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }), totalFilas: filas.length - 1 };
}

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: LOGIN_USER, password: LOGIN_PASS }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`No se pudo iniciar sesion: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function subirTipo(token, tipo, buffer, nombreArchivo) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo);

  const res = await fetch(`${API_URL}/api/correlativa/upload/${tipo}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  return { status: res.status, data };
}

(async () => {
  console.log(`API_URL=${API_URL}`);
  console.log('Iniciando sesion...');
  const token = await login();
  console.log('Sesion iniciada.\n');

  for (const { tipo, csv } of ARCHIVOS) {
    if (!fs.existsSync(csv)) {
      console.error(`[${tipo}] No se encontro el archivo: ${csv}`);
      continue;
    }
    const { buffer, totalFilas } = csvToXlsxBuffer(csv);
    console.log(`[${tipo}] ${path.basename(csv)}: ${totalFilas} filas de datos. Subiendo...`);
    const { status, data } = await subirTipo(token, tipo, buffer, path.basename(csv, '.csv') + '.xlsx');
    if (status !== 200) {
      console.error(`[${tipo}] ERROR (${status}):`, JSON.stringify(data, null, 2));
      continue;
    }
    console.log(`[${tipo}] ${data.message}`);
    if (data.sheets?.[0]) {
      const h = data.sheets[0];
      console.log(`         insertados=${h.inserted} omitidos=${h.skipped} errores=${h.errors.length} avisos=${h.warnings.length}`);
      if (h.errors.length) console.log('         primeros errores:', h.errors.slice(0, 5));
    }
    console.log('');
  }
})().catch((err) => {
  console.error('Fallo la siembra:', err);
  process.exit(1);
});
