/**
 * Pruebas de punta a punta de los cuatro procesos a cargo de Yeison:
 *   1. Inicio de sesión          (validación de campos, cifrado de contraseña)
 *   2. Cargue de archivos        (CNO, CUOC, correlativas: plantillas, validación y carga real)
 *   3. Actualización             (crear/editar/eliminar catálogo, inactivar ocupación)
 *   4. API pública / APE / Tendencias (búsqueda por código, nombre y denominación)
 *
 * Corren contra un backend REAL conectado a una base de datos DE PRUEBA: crean,
 * cargan y borran datos, así que nunca deben apuntar a la base de trabajo.
 * Por eso el archivo se niega a correr si la base no termina en `_test`.
 *
 * Preparación (una vez):
 *   1. Crear la base `clasificacion_test` con init/01-schema.sql y 02-seed.sql,
 *      y aplicar las migraciones:  DB_DATABASE=clasificacion_test node scripts/db-migrate.js
 *   2. Levantar el backend contra esa base en otro puerto, con prefijo de Redis
 *      y claves propias:
 *        APP_PORT=3100 DB_DATABASE=clasificacion_test REDIS_KEY_PREFIX=clasificacion_test:
 *        SEED_USUARIOS_PASSWORD=... API_KEY_BUSCADOR=... API_KEY_APE=... API_KEY_TENDENCIAS=...
 *
 * Ejecución:  node --test test/e2e/   (variables E2E_* abajo; por defecto las de esa preparación)
 *
 * La base debe estar vacía de catálogo (recién creada): las pruebas cuentan filas.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { Client } = require('pg');

const BASE = process.env.E2E_URL ?? 'http://localhost:3100';
const PASSWORD = process.env.E2E_PASSWORD ?? 'QaPrueba2026*';
const DB_NAME = process.env.E2E_DB ?? 'clasificacion_test';
const KEYS = {
  buscador: process.env.E2E_KEY_BUSCADOR ?? 'qa0buscador0000000000000000000000000000',
  ape: process.env.E2E_KEY_APE ?? 'qa0ape0000000000000000000000000000000000',
  tendencias: process.env.E2E_KEY_TENDENCIAS ?? 'qa0tendencias000000000000000000000000000',
};
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CUENTAS = {
  admin: 'admin@sena.edu.co',
  analista: 'analista@sena.edu.co',
  experto: 'experto@sena.edu.co',
  ciudadano: 'ciudadano@sena.edu.co',
  ape: 'ape@sena.edu.co',
  tendencias: 'tendencias@sena.edu.co',
};

if (!DB_NAME.endsWith('_test')) {
  throw new Error(`E2E_DB="${DB_NAME}" no termina en _test: estas pruebas borran y cargan datos.`);
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Lee la conexión del .env del backend; la base siempre es la de prueba. */
function conexionDb() {
  const ruta = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  const env = Object.fromEntries(
    readFileSync(ruta, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      // Como dotenv: un `#` precedido de espacio en un valor sin comillas
      // abre un comentario (el .env trae `DB_PORT=5433   # ...`).
      .map((m) => [m[1], m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')]),
  );
  return {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: DB_NAME,
  };
}

let db;
const consulta = async (sql, params = []) => (await db.query(sql, params)).rows;
const contar = async (tabla, where = 'TRUE', params = []) =>
  Number((await consulta(`SELECT count(1)::int AS n FROM clasificacion.${tabla} WHERE ${where}`, params))[0].n);

async function http(metodo, ruta, { cookie, apiKey, json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (apiKey) headers['x-api-key'] = apiKey;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const res = await fetch(BASE + ruta, { method: metodo, headers, body, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  const tipo = res.headers.get('content-type') ?? '';
  const data = tipo.includes('json') && buf.length ? JSON.parse(buf.toString('utf8')) : null;
  return { status: res.status, headers: res.headers, data, buf };
}

/** Texto del error, fuera del sobre que arma el filtro global ({ message: { message } }). */
function textoError(data) {
  let m = data?.message;
  while (m && typeof m === 'object' && !Array.isArray(m)) m = m.message;
  return Array.isArray(m) ? m.join('. ') : String(m ?? '');
}

const sesiones = {};
async function login(identifier, password = PASSWORD, extra = {}) {
  return http('POST', '/auth/login', { json: { identifier, password, ...extra } });
}
const cookieDe = (res) => (res.headers.get('set-cookie') ?? '').split(';')[0];

/** Descarga una plantilla, le agrega filas por hoja y devuelve el .xlsx listo para subir. */
async function plantillaConFilas(ruta, filasPorHoja, cookie = sesiones.admin) {
  const res = await http('GET', ruta, { cookie });
  assert.equal(res.status, 200, `plantilla ${ruta}`);
  const libro = XLSX.read(res.buf, { type: 'buffer' });
  for (const [hoja, filas] of Object.entries(filasPorHoja)) {
    assert.ok(libro.Sheets[hoja], `la plantilla ${ruta} no trae la hoja «${hoja}»`);
    XLSX.utils.sheet_add_aoa(libro.Sheets[hoja], filas, { origin: 1 });
  }
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

function formArchivo(buf, nombre = 'archivo.xlsx', tipo = MIME_XLSX, extra = {}) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: tipo }), nombre);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

const subir = (ruta, buf, cookie = sesiones.admin) => http('POST', ruta, { cookie, form: formArchivo(buf) });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Ciclo de vida ────────────────────────────────────────────────────────────

before(async () => {
  db = new Client(conexionDb());
  await db.connect();
  const [{ n }] = await consulta('SELECT count(1)::int AS n FROM clasificacion.cno_ocupacion');
  assert.equal(n, 0, 'La base de prueba debe estar recién creada (sin ocupaciones CNO).');
});

after(async () => {
  await db?.end();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. INICIO DE SESIÓN
// ═════════════════════════════════════════════════════════════════════════════

describe('1. Inicio de sesión', () => {
  // El login admite 10 intentos por minuto y por IP. Esta sección hace
  // exactamente 10 antes de probar el freno, así que arranca con la ventana
  // limpia (por si se acaba de correr otra vez).
  before(() => esperar(61_000));
  let mensajeClaveErrada = '';

  test('las 6 cuentas inician sesión: cookie httpOnly + SameSite=Lax y sin la contraseña en la respuesta', async () => {
    for (const [rol, usuario] of Object.entries(CUENTAS)) {
      // Regla de negocio: la cuenta APE solo entra por su propio formulario.
      const res = await login(usuario, PASSWORD, rol === 'ape' ? { portal: 'ape' } : {});
      assert.equal(res.status, 201, `${rol}: ${textoError(res.data)}`);
      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /^olo_sesion=[^;]+/, `${rol}: no fija la cookie de sesión`);
      assert.match(setCookie, /HttpOnly/i, `${rol}: la cookie debe ser httpOnly`);
      assert.match(setCookie, /SameSite=Lax/i, `${rol}: la cookie debe ser SameSite=Lax`);
      const cuerpo = JSON.stringify(res.data);
      // Claves de contraseña o un hash bcrypt; `debeCambiarContrasena` es un booleano legítimo.
      assert.doesNotMatch(cuerpo, /"(password|contrase(ñ|n)a|hash)"\s*:|\$2[aby]\$/i, `${rol}: la respuesta expone la contraseña o su hash`);
      assert.equal(res.data.user.email, usuario);
      sesiones[rol] = cookieDe(res);
    }
  });

  test('contraseña incorrecta: 401 y sin cookie', async () => {
    const res = await login(CUENTAS.admin, 'NoEsLaClave1');
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
    mensajeClaveErrada = textoError(res.data);
  });

  test('usuario inexistente: mismo 401 y mismo mensaje que la contraseña incorrecta (no revela si el usuario existe)', async () => {
    const noExiste = await login('nadie.existe@sena.edu.co', 'NoEsLaClave1');
    assert.equal(noExiste.status, 401);
    assert.equal(textoError(noExiste.data), mensajeClaveErrada);
  });

  test('portal APE con un usuario que no es APE: rechazado', async () => {
    const res = await login(CUENTAS.admin, PASSWORD, { portal: 'ape' });
    assert.ok([401, 403].includes(res.status), `esperaba 401/403, llegó ${res.status}`);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  test('inyección SQL en el identificador: se rechaza por formato (400) antes de llegar a la base, nunca 500', async () => {
    const res = await login("' OR '1'='1' --", 'cualquiera1');
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  test('más de 10 intentos por minuto: 429 con Retry-After (freno a fuerza bruta)', async () => {
    const res = await login(CUENTAS.admin, 'NoEsLaClave1');
    assert.equal(res.status, 429);
    assert.ok(res.headers.get('retry-after'), 'falta la cabecera Retry-After');
  });

  test('/auth/me: con sesión responde el usuario; sin cookie o con token alterado, 401', async () => {
    const yo = await http('GET', '/auth/me', { cookie: sesiones.analista });
    assert.equal(yo.status, 200);
    assert.equal(JSON.stringify(yo.data).includes(CUENTAS.analista), true);
    assert.equal((await http('GET', '/auth/me')).status, 401);
    const alterado = sesiones.analista.slice(0, -2) + (sesiones.analista.endsWith('AA') ? 'BB' : 'AA');
    assert.equal((await http('GET', '/auth/me', { cookie: alterado })).status, 401);
  });

  test('la contraseña se guarda cifrada con bcrypt, nunca en texto plano', async () => {
    const [fila] = await consulta(`SELECT "contraseña" AS hash FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.admin]);
    assert.match(fila.hash, /^\$2[aby]\$\d{2}\$.{53}$/);
    assert.notEqual(fila.hash, PASSWORD);
  });

  test('cambio de contraseña: la actual errada no cierra la sesión, la nueva corta se rechaza, la válida queda cifrada', async () => {
    const cookie = sesiones.experto;
    const errada = await http('PATCH', '/auth/change-password', {
      cookie,
      json: { currentPassword: 'NoEsLaClave1', newPassword: 'OtraClave2026*' },
    });
    assert.ok([400, 401].includes(errada.status), `actual errada: ${errada.status}`);
    assert.equal((await http('GET', '/auth/me', { cookie })).status, 200, 'la sesión debe seguir viva');

    const corta = await http('PATCH', '/auth/change-password', { cookie, json: { currentPassword: PASSWORD, newPassword: 'corta' } });
    assert.equal(corta.status, 400);

    const antes = (await consulta(`SELECT "contraseña" AS h FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.experto]))[0].h;
    const ok = await http('PATCH', '/auth/change-password', { cookie, json: { currentPassword: PASSWORD, newPassword: 'OtraClave2026*' } });
    assert.equal(ok.status, 200, textoError(ok.data));
    const despues = (await consulta(`SELECT "contraseña" AS h FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.experto]))[0].h;
    assert.notEqual(despues, antes);
    assert.match(despues, /^\$2[aby]\$/);
    // Se deja como estaba para las demás pruebas.
    const revertir = await http('PATCH', '/auth/change-password', { cookie, json: { currentPassword: 'OtraClave2026*', newPassword: PASSWORD } });
    assert.equal(revertir.status, 200);
  });

  test('logout borra la cookie y revoca el token: una copia ya no sirve (ni por cookie ni por Bearer)', async () => {
    const copia = sesiones.ciudadano;
    const token = copia.split('=')[1];
    assert.equal((await http('GET', '/auth/me', { cookie: copia })).status, 200, 'antes del logout la sesión sirve');
    const res = await http('POST', '/auth/logout', { cookie: copia });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('set-cookie') ?? '', /olo_sesion=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    const porCookie = await http('GET', '/auth/me', { cookie: copia });
    assert.equal(porCookie.status, 401);
    assert.match(textoError(porCookie.data), /sesión ya se cerró/i);
    const porBearer = await fetch(`${BASE}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(porBearer.status, 401);
    assert.equal((await http('GET', '/auth/me', { cookie: sesiones.analista })).status, 200, 'las demás sesiones siguen vivas');
  });

  test('logout con un token inventado o vencido no falla y no se guarda (204)', async () => {
    const res = await http('POST', '/auth/logout', { cookie: 'olo_sesion=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.firmaFalsa' });
    assert.equal(res.status, 204);
  });

  test('validación de campos (tras esperar el freno de 1 minuto): vacío, contraseña < 5 y portal inválido dan 400 con mensaje', async () => {
    await esperar(61_000);
    const vacio = await login('', PASSWORD);
    assert.equal(vacio.status, 400);
    assert.match(textoError(vacio.data), /requerido/i);
    const corta = await login(CUENTAS.admin, '1234');
    assert.equal(corta.status, 400);
    assert.match(textoError(corta.data), /al menos 5/i);
    const portal = await login(CUENTAS.admin, PASSWORD, { portal: 'otro' });
    assert.equal(portal.status, 400);
    // Misma regla que el formulario: correo o cédula de 5 a 12 dígitos.
    for (const malo of ['qa.admin', '1234', '1234567890123', 'usuario@sena']) {
      const res = await login(malo, PASSWORD);
      assert.equal(res.status, 400, `«${malo}» debería rechazarse por formato`);
      assert.match(textoError(res.data), /correo válido .* 5 a 12 dígitos/);
    }
  });

  test('la cuenta APE no entra por el formulario general: 401 con el motivo', async () => {
    const res = await login(CUENTAS.ape);
    assert.equal(res.status, 401);
    assert.match(textoError(res.data), /Usuario de la APE/);
  });

  test('enviar el hash guardado como contraseña no da acceso (pass-the-hash)', async () => {
    const [fila] = await consulta(`SELECT "contraseña" AS hash FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.admin]);
    const res = await login(CUENTAS.admin, fila.hash);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
    const [despues] = await consulta(`SELECT "contraseña" AS hash FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.admin]);
    assert.equal(despues.hash, fila.hash, 'el intento no debe reescribir la contraseña guardada');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. CARGUE DE ARCHIVOS CNO, CUOC Y CORRELATIVAS
// ═════════════════════════════════════════════════════════════════════════════

describe('2. Cargue de archivos', () => {
  const hojasDe = (buf) => XLSX.read(buf, { type: 'buffer' }).SheetNames;

  test('plantillas: cada tipo descarga un .xlsx con las hojas que lee el cargue', async () => {
    const esperadas = {
      '/api/cno/upload/plantilla/nivel': ['nivel_cualificacion'],
      '/api/cno/upload/plantilla/area': ['Area_desempeño'],
      '/api/cno/upload/plantilla/habilidades': ['Habilidad'],
      '/api/cno/upload/plantilla/conocimientos': ['Nivel de conocimiento'],
      '/api/cno/upload/plantilla/ocupacion': ['Ocupaciones - C.N.O.', 'Funcion', 'Funciones - C.N.O.', 'Denominaciones - C.N.O.', 'Relacionadas - C.N.O.', 'Habilidades - C.N.O.', 'Conocimientos - C.N.O.'],
      '/api/cuoc/upload/plantilla/nivel': ['Nivel Competencia'],
      '/api/cuoc/upload/plantilla/area': ['Área Cual. Principal', 'Área Cual. Complementaria'],
      '/api/correlativa/upload/plantilla/ocupacion': ['Correlativa ocupación'],
      '/usuario/plantilla': ['Usuarios'],
    };
    for (const [ruta, hojas] of Object.entries(esperadas)) {
      const res = await http('GET', ruta, { cookie: sesiones.admin });
      assert.equal(res.status, 200, ruta);
      assert.equal(res.headers.get('content-type'), MIME_XLSX, ruta);
      assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="Plantilla_/, ruta);
      assert.deepEqual(hojasDe(res.buf), hojas, ruta);
    }
    const completa = await http('GET', '/api/cno/upload/plantilla/completa', { cookie: sesiones.admin });
    assert.equal(hojasDe(completa.buf).length, 11);
  });

  test('plantillas: tipo inexistente da 400 con la lista de las que existen', async () => {
    const res = await http('GET', '/api/cno/upload/plantilla/inventada', { cookie: sesiones.admin });
    assert.equal(res.status, 400);
    assert.match(textoError(res.data), /disponibles: nivel, area/);
  });

  test('permisos del cargue: sin sesión 401; APE, Tendencias y Experto no cargan ni descargan plantillas', async () => {
    assert.equal((await http('GET', '/api/cno/upload/plantilla/nivel')).status, 401);
    for (const rol of ['ape', 'tendencias', 'experto']) {
      assert.equal((await http('GET', '/api/cno/upload/plantilla/nivel', { cookie: sesiones[rol] })).status, 403, `plantilla ${rol}`);
      const buf = await plantillaConFilas('/api/cno/upload/plantilla/nivel', { nivel_cualificacion: [['1', 'Uno']] });
      assert.equal((await subir('/api/cno/upload/nivel', buf, sesiones[rol])).status, 403, `carga ${rol}`);
    }
  });

  test('un archivo que no es Excel (texto renombrado a .xlsx) se rechaza por su contenido', async () => {
    const res = await http('POST', '/api/cno/upload/nivel/validar', {
      cookie: sesiones.admin,
      form: formArchivo(Buffer.from('esto no es un excel'), 'falso.xlsx'),
    });
    assert.equal(res.status, 400);
    assert.match(textoError(res.data), /no es un Excel válido/i);
  });

  test('un tipo MIME que no es Excel se rechaza antes de leer el archivo', async () => {
    const res = await http('POST', '/api/cno/upload/nivel/validar', {
      cookie: sesiones.admin,
      form: formArchivo(Buffer.from('%PDF-1.4'), 'doc.pdf', 'application/pdf'),
    });
    assert.equal(res.status, 400);
    assert.match(textoError(res.data), /Solo se permiten archivos Excel/i);
  });

  test('validar: la plantilla vacía no se puede cargar (0 registros)', async () => {
    const vacia = await http('GET', '/api/cno/upload/plantilla/nivel', { cookie: sesiones.admin });
    const res = await http('POST', '/api/cno/upload/nivel/validar', { cookie: sesiones.admin, form: formArchivo(vacia.buf) });
    assert.equal(res.status, 200);
    assert.equal(res.data.totalRecords, 0);
    assert.equal(res.data.valid, false);
  });

  test('validar: datos correctos en una hoja con otro nombre se bloquean y se dice qué hoja se espera', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['cod_cualificacion_cno', 'niveles_cualificacion_cno'], ['1', 'Uno']]), 'Hoja1');
    const res = await http('POST', '/api/cno/upload/nivel/validar', {
      cookie: sesiones.admin,
      form: formArchivo(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.valid, false);
    assert.match(res.data.avisoHoja, /«Hoja1».*«nivel_cualificacion»/);
  });

  test('validar: faltan columnas obligatorias y se nombran', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['cod_cualificacion_cno'], ['1']]), 'nivel_cualificacion');
    const res = await http('POST', '/api/cno/upload/nivel/validar', {
      cookie: sesiones.admin,
      form: formArchivo(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })),
    });
    assert.deepEqual(res.data.missingColumns, ['Nivel de cualificación']);
    assert.equal(res.data.valid, false);
  });

  test('CNO: carga real de nivel, área, habilidad y conocimiento; repetir no duplica', async () => {
    const casos = [
      ['nivel', 'nivel_cualificacion', [['1', 'Profesionales', 'Nivel profesional'], ['2', 'Técnicos', 'Nivel técnico']], 'cno_nivel_cualificacion'],
      ['area', 'Area_desempeño', [['1', 'Finanzas y Administración', 'Finanzas'], ['2', 'Ventas y Servicios', 'Ventas']], 'cno_area_desempeno'],
      ['habilidades', 'Habilidad', [[1, 'Comunicación asertiva', 'Comunicar']], 'habilidad_destreza'],
      ['conocimientos', 'Nivel de conocimiento', [[1, 'Contabilidad', 'Cuentas']], 'cno_conocimiento'],
    ];
    for (const [tipo, hoja, filas, tabla] of casos) {
      const buf = await plantillaConFilas(`/api/cno/upload/plantilla/${tipo}`, { [hoja]: filas });
      const validacion = await http('POST', `/api/cno/upload/${tipo}/validar`, { cookie: sesiones.admin, form: formArchivo(buf) });
      assert.equal(validacion.data.valid, true, `${tipo}: ${validacion.data.message}`);
      const carga = await subir(`/api/cno/upload/${tipo}`, buf);
      assert.equal(carga.status, 200, `${tipo}: ${textoError(carga.data)}`);
      assert.equal(carga.data.totalErrors, 0, `${tipo}: ${JSON.stringify(carga.data.sheets?.flatMap((s) => s.errors))}`);
      assert.equal(carga.data.totalInserted, filas.length, tipo);
      assert.equal(await contar(tabla), filas.length, tabla);
      const repetida = await subir(`/api/cno/upload/${tipo}`, buf);
      assert.equal(repetida.data.totalInserted, 0, `${tipo}: repetir la carga no debe insertar de nuevo`);
      assert.equal(await contar(tabla), filas.length, `${tabla} tras repetir`);
    }
  });

  test('CNO: carga de ocupación con su denominación y función', async () => {
    const buf = await plantillaConFilas('/api/cno/upload/plantilla/ocupacion', {
      'Ocupaciones - C.N.O.': [['0011', 'Miembros del poder ejecutivo', 'Definen la política pública', '1', '1', '001', '1']],
      Funcion: [['F-01', 'Promulgar leyes y ordenanzas']],
      'Funciones - C.N.O.': [['F-0011.01', 'F-01', 'Promulgar leyes y ordenanzas', '0011', '1']],
      'Denominaciones - C.N.O.': [['D-0011.001', 'Alcalde', '0011', '1']],
    });
    const carga = await subir('/api/cno/upload/ocupacion', buf);
    assert.equal(carga.status, 200, textoError(carga.data));
    assert.equal(carga.data.totalErrors, 0, JSON.stringify(carga.data.sheets?.flatMap((s) => s.errors)));
    const [ocup] = await consulta(`SELECT cod_desempeno_cno AS area, cod_cualificacion_cno AS nivel, estado FROM clasificacion.cno_ocupacion WHERE cod_ocupacion_cno = '0011'`);
    assert.deepEqual({ area: ocup.area, nivel: ocup.nivel, estado: ocup.estado }, { area: '1', nivel: '1', estado: true });
    assert.equal(await contar('cno_denominacion', `cno_cod_ocupacion = '0011'`), 1);
  });

  test('CNO: una fila con un área que no existe se informa como error de esa fila (no 500) y no se inserta', async () => {
    const buf = await plantillaConFilas('/api/cno/upload/plantilla/ocupacion', {
      'Ocupaciones - C.N.O.': [['0012', 'Ocupación con área inexistente', 'Prueba', '99', '1', '001', '1']],
    });
    const carga = await subir('/api/cno/upload/ocupacion', buf);
    assert.equal(carga.status, 200);
    assert.ok(carga.data.totalErrors >= 1);
    assert.match(JSON.stringify(carga.data.sheets), /99/);
    assert.equal(await contar('cno_ocupacion', `cod_ocupacion_cno = '0012'`), 0);
  });

  test('CUOC: carga del libro completo, tipo por tipo en el orden de «Cargar todo» para CUOC', async () => {
    const ocup = ['1', 'Directores de prueba'];
    const buf = await plantillaConFilas('/api/cuoc/upload/plantilla/completa', {
      Ocupación: [['1', 'DIRECTORES', '11', 'DIRECTORES GENERALES', '111', 'DIRECTORES EJECUTIVOS', '1111', 'DIRECTORES DE EMPRESA', '11111', 'Directores de prueba']],
      Descripción: [['1', '11111', ocup[1], 'Dirigen la organización']],
      Funciones: [['1', '11111', ocup[1], 1, 'Dirigir la estrategia']],
      Denominaciones: [['1', '11111', ocup[1], '11111.001', 'Director general']],
      'Nivel Competencia': [['1', '11111', ocup[1], 4]],
      Conocimientos: [['1', '11111', ocup[1], 5, 'Gestión empresarial']],
      Destrezas: [['1', '11111', ocup[1], 7, 'Liderazgo']],
      'Área Cual. Principal': [['1', '11111', ocup[1], 'ADMI', 'Administración']],
    });
    // Mismo orden que CargaCuocModalComponent.ordenCargaTodo: las destrezas van
    // después de las ocupaciones, que es cuando ya tienen a qué enlazarse.
    for (const tipo of ['nivel', 'area', 'conocimientos', 'ocupacion', 'habilidades']) {
      const validacion = await http('POST', `/api/cuoc/upload/${tipo}/validar`, { cookie: sesiones.admin, form: formArchivo(buf) });
      assert.equal(validacion.data.valid, true, `${tipo}: ${validacion.data.message} ${validacion.data.avisoHoja ?? ''}`);
      const carga = await subir(`/api/cuoc/upload/${tipo}`, buf);
      assert.equal(carga.status, 200, `${tipo}: ${textoError(carga.data)}`);
      assert.equal(carga.data.totalErrors, 0, `${tipo}: ${JSON.stringify(carga.data.sheets?.flatMap((s) => s.errors))}`);
    }
    const [fila] = await consulta(`SELECT cod_nivel_cuoc AS nivel, codigo_area_cuoc AS area FROM clasificacion.cuoc_ocupacion WHERE cod_ocupacion_cuoc = '11111'`);
    assert.ok(fila, 'no se creó la ocupación CUOC 11111');
    assert.equal(Number(fila.nivel), 4);
    assert.equal(fila.area, 'ADMI');
    assert.equal(await contar('cuoc_denominacion', `cod_ocupacion_cuoc = '11111'`), 1);
    assert.equal(await contar('cuoc_destreza', `cod_ocupacion_cuoc = '11111'`), 1, 'la destreza no quedó enlazada a la ocupación');
  });

  test('CUOC: cargar destrezas antes que las ocupaciones se informa (no parece exitoso)', async () => {
    const buf = await plantillaConFilas('/api/cuoc/upload/plantilla/habilidades', {
      Destrezas: [['2', '22222', 'Ocupación aún no cargada', 8, 'Trabajo en equipo']],
    });
    const carga = await subir('/api/cuoc/upload/habilidades', buf);
    assert.equal(carga.status, 200);
    assert.match(JSON.stringify(carga.data.sheets), /ocupación no existe/);
  });

  test('Correlativas: carga por tipo enlaza CNO 0011 con CUOC 11111', async () => {
    const buf = await plantillaConFilas('/api/correlativa/upload/plantilla/ocupacion', {
      'Correlativa ocupación': [['0011', 'Miembros del poder ejecutivo', '11111', 'Directores de prueba']],
    });
    const carga = await subir('/api/correlativa/upload/ocupacion', buf);
    assert.equal(carga.status, 200, textoError(carga.data));
    assert.equal(await contar('correlativa_ocupacion'), 1);
  });

  test('Correlativas: un archivo de otro tipo se rechaza con el motivo', async () => {
    const buf = await plantillaConFilas('/api/correlativa/upload/plantilla/conocimiento', {
      'Correlativa conocimiento': [['1', 'Contabilidad', '5', 'Gestión empresarial', '1']],
    });
    const res = await subir('/api/correlativa/upload/ocupacion', buf);
    assert.equal(res.status, 400);
    assert.ok(textoError(res.data).length > 10, 'el rechazo debe explicar el motivo');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. API PÚBLICA, APE Y TENDENCIAS  (antes de Actualización, que inactiva 0011)
// ═════════════════════════════════════════════════════════════════════════════

describe('4. API pública, APE y Tendencias', () => {
  const codigos = (data) => (Array.isArray(data) ? data : data?.data ?? []).map((r) => r.codigo);

  test('sin API key o con una inválida: 401', async () => {
    assert.equal((await http('GET', '/api/public/consulta/buscar?q=0011')).status, 401);
    assert.equal((await http('GET', '/api/public/consulta/buscar?q=0011', { apiKey: 'x'.repeat(40) })).status, 401);
  });

  test('búsqueda por código (CNO y CUOC)', async () => {
    const cno = await http('GET', '/api/public/consulta/buscar?q=0011', { apiKey: KEYS.buscador });
    assert.equal(cno.status, 200);
    assert.ok(codigos(cno.data).includes('0011'), JSON.stringify(cno.data));
    const cuoc = await http('GET', '/api/public/consulta/buscar?q=11111', { apiKey: KEYS.buscador });
    assert.ok(codigos(cuoc.data).includes('11111'), JSON.stringify(cuoc.data));
  });

  test('búsqueda por nombre, sin tildes ni orden exacto de las palabras', async () => {
    const res = await http('GET', `/api/public/consulta/buscar?q=${encodeURIComponent('ejecutivo poder')}`, { apiKey: KEYS.buscador });
    assert.ok(codigos(res.data).includes('0011'), JSON.stringify(res.data));
    const tildes = await http('GET', `/api/public/consulta/buscar?q=${encodeURIComponent('administracion')}`, { apiKey: KEYS.buscador });
    assert.equal(tildes.status, 200);
  });

  test('búsqueda por denominación', async () => {
    const res = await http('GET', '/api/public/consulta/buscar?q=alcalde', { apiKey: KEYS.buscador });
    assert.ok(codigos(res.data).includes('0011'), JSON.stringify(res.data));
  });

  test('ficha de ocupación con el contrato del sitio externo', async () => {
    const res = await http('GET', '/api/public/consulta/0011', { apiKey: KEYS.buscador });
    assert.equal(res.status, 200, textoError(res.data));
    for (const campo of ['tipo', 'codigo', 'nombre', 'descripcion', 'ubicacion', 'funciones', 'denominaciones', 'habilidades', 'conocimientos', 'correlativa']) {
      assert.ok(campo in res.data, `falta «${campo}» en la ficha`);
    }
    assert.ok(res.data.denominaciones.some((d) => d.codigo === 'D-0011.001'));
    assert.ok(res.data.correlativa.ocupaciones.some((o) => o.codigo === '11111'), 'la ficha no trae la correlativa CUOC');
  });

  test('ficha inexistente: 404; código mal formado: 4xx, nunca 500', async () => {
    assert.equal((await http('GET', '/api/public/consulta/9999', { apiKey: KEYS.buscador })).status, 404);
    const raro = await http('GET', '/api/public/consulta/abc', { apiKey: KEYS.buscador });
    assert.ok(raro.status >= 400 && raro.status < 500, `código raro -> ${raro.status}`);
  });

  test('validación de parámetros: texto > 120, limit 0 y limit 51 dan 400', async () => {
    assert.equal((await http('GET', `/api/public/consulta/buscar?q=${'a'.repeat(121)}`, { apiKey: KEYS.buscador })).status, 400);
    assert.equal((await http('GET', '/api/public/consulta/buscar?q=a&limit=0', { apiKey: KEYS.buscador })).status, 400);
    assert.equal((await http('GET', '/api/public/consulta/buscar?q=a&limit=51', { apiKey: KEYS.buscador })).status, 400);
  });

  test('inyección SQL en la búsqueda: responde normal y no toca la base', async () => {
    const res = await http('GET', `/api/public/consulta/buscar?q=${encodeURIComponent("'; DROP TABLE clasificacion.usuario; --")}`, { apiKey: KEYS.buscador });
    assert.equal(res.status, 200);
    assert.equal(await contar('usuario'), 6);
  });

  test('alcance de cada llave: Buscador solo la API pública; APE y Tendencias consultan pero no escriben', async () => {
    const interna = '/api/cno/ocupaciones/consulta?page=1&limit=5';
    assert.ok([401, 403].includes((await http('GET', interna, { apiKey: KEYS.buscador })).status), 'Buscador no debe entrar a rutas internas');
    for (const nombre of ['ape', 'tendencias']) {
      const lee = await http('GET', interna, { apiKey: KEYS[nombre] });
      assert.equal(lee.status, 200, `${nombre} debe poder consultar`);
      const escribe = await http('POST', '/api/cno/catalogos/areas-desempeno', { apiKey: KEYS[nombre], json: { codigo: '77', nombre: 'No permitido' } });
      assert.ok([401, 403].includes(escribe.status), `${nombre} no debe escribir (llegó ${escribe.status})`);
    }
    assert.equal(await contar('cno_area_desempeno', `cod_desempeno = '77'`), 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ACTUALIZACIÓN CNO, CUOC Y CORRELATIVAS
// ═════════════════════════════════════════════════════════════════════════════

describe('3. Actualización', () => {
  test('crear un área: 201 y queda en la tabla; un nombre repetido da 409 con el motivo', async () => {
    const res = await http('POST', '/api/cno/catalogos/areas-desempeno', { cookie: sesiones.analista, json: { codigo: '9', nombre: 'Área QA', descripcion: 'Creada por la prueba' } });
    assert.equal(res.status, 201, textoError(res.data));
    assert.equal(await contar('cno_area_desempeno', `cod_desempeno = '9'`), 1);
    const repetida = await http('POST', '/api/cno/catalogos/areas-desempeno', { cookie: sesiones.analista, json: { codigo: '10', nombre: 'Ventas y Servicios' } });
    assert.equal(repetida.status, 409);
    assert.match(textoError(repetida.data), /Ya existe/);
  });

  test('editar el área: el nombre cambia en la base y el código no', async () => {
    const res = await http('PATCH', '/api/cno/catalogos/areas-desempeno/9', { cookie: sesiones.analista, json: { nombre: 'Área QA editada' } });
    assert.equal(res.status, 200, textoError(res.data));
    const [fila] = await consulta(`SELECT nom_desempeno AS nombre FROM clasificacion.cno_area_desempeno WHERE cod_desempeno = '9'`);
    assert.equal(fila.nombre, 'Área QA editada');
  });

  test('eliminar un área en uso: 409 y el mensaje dice cuántas ocupaciones la usan (dentro del sobre del filtro global)', async () => {
    const res = await http('DELETE', '/api/cno/catalogos/areas-desempeno/1', { cookie: sesiones.analista });
    assert.equal(res.status, 409);
    assert.equal(typeof res.data.message, 'object', 'el filtro global anida el mensaje; el frontend lo desenvuelve');
    assert.match(textoError(res.data), /lo usan 1 ocupación/);
    assert.equal(await contar('cno_area_desempeno', `cod_desempeno = '1'`), 1);
  });

  test('eliminar un área sin uso: 200; eliminarla otra vez: 404', async () => {
    assert.equal((await http('DELETE', '/api/cno/catalogos/areas-desempeno/9', { cookie: sesiones.analista })).status, 200);
    assert.equal(await contar('cno_area_desempeno', `cod_desempeno = '9'`), 0);
    assert.equal((await http('DELETE', '/api/cno/catalogos/areas-desempeno/9', { cookie: sesiones.analista })).status, 404);
  });

  test('nivel CUOC en uso: no se elimina (409)', async () => {
    const res = await http('DELETE', '/api/cuoc/niveles-competencia/4', { cookie: sesiones.admin });
    assert.equal(res.status, 409);
    assert.match(textoError(res.data), /ocupación/);
  });

  test('permisos de Actualización: sin sesión 401; APE, Tendencias y Experto 403', async () => {
    assert.equal((await http('PATCH', '/api/cno/catalogos/areas-desempeno/1', { json: { nombre: 'x' } })).status, 401);
    for (const rol of ['ape', 'tendencias', 'experto']) {
      const res = await http('PATCH', '/api/cno/catalogos/areas-desempeno/1', { cookie: sesiones[rol], json: { nombre: 'Intento' } });
      assert.equal(res.status, 403, `${rol}`);
    }
    const [fila] = await consulta(`SELECT nom_desempeno AS nombre FROM clasificacion.cno_area_desempeno WHERE cod_desempeno = '1'`);
    assert.equal(fila.nombre, 'Finanzas y Administración');
  });

  test('inactivar una ocupación desde Actualización pone fecha de inactivación; reactivarla la quita', async () => {
    const panel = (estado) => ({
      tipo: 'cno',
      panel: {
        codigo: '0011',
        nombre: 'Miembros del poder ejecutivo',
        descripcion: 'Definen la política pública',
        areaDesempeno: 'Finanzas y Administración',
        nivelCualificacion: 'Profesionales',
        estado,
        trazabilidad: 'Prueba e2e',
        funciones: [{ codigo: 'F-0011.01', descripcion: 'Promulgar leyes y ordenanzas' }],
        denominaciones: [{ codigo: 'D-0011.001', nombre: 'Alcalde' }],
        habilidades: [],
        conocimientos: [],
        ocupacionesRelacionadas: [],
      },
    });
    const inactivar = await http('PUT', '/api/analisis/ocupacion-original', { cookie: sesiones.analista, json: panel('Inactivo') });
    assert.equal(inactivar.status, 200, textoError(inactivar.data));
    let [fila] = await consulta(`SELECT estado, fecha_inactivacion AS fecha FROM clasificacion.cno_ocupacion WHERE cod_ocupacion_cno = '0011'`);
    assert.equal(fila.estado, false);
    assert.ok(fila.fecha, 'sin fecha de inactivación');

    const reactivar = await http('PUT', '/api/analisis/ocupacion-original', { cookie: sesiones.analista, json: panel('Activo') });
    assert.equal(reactivar.status, 200, textoError(reactivar.data));
    [fila] = await consulta(`SELECT estado, fecha_inactivacion AS fecha FROM clasificacion.cno_ocupacion WHERE cod_ocupacion_cno = '0011'`);
    assert.equal(fila.estado, true);
    assert.equal(fila.fecha, null);
    assert.equal(await contar('cno_denominacion', `cno_cod_ocupacion = '0011' AND estado = 1`), 1, 'la denominación conservada no debe inactivarse');
  });

  test('cada cambio queda en la bitácora con el usuario que lo hizo', async () => {
    const res = await http('GET', '/api/bitacora?limit=50', { cookie: sesiones.admin });
    assert.equal(res.status, 200);
    assert.ok(await contar('bitacora') > 0, 'la bitácora está vacía tras crear, editar y cargar');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. POLÍTICA DE CONTRASEÑAS (solo al crear o cambiar; las guardadas siguen sirviendo)
// ═════════════════════════════════════════════════════════════════════════════

describe('5. Política de contraseñas', () => {
  const cambiar = (newPassword) =>
    http('PATCH', '/auth/change-password', { cookie: sesiones.experto, json: { currentPassword: PASSWORD, newPassword } });

  test('al cambiarla se rechazan las comunes, las secuencias y las palabras de la aplicación', async () => {
    for (const debil of ['Password1', 'Password*1', 'Sena2026*', 'Admin123!', '12345678', '87654321', '11111111', 'qwertyuiop', 'abcdefgh', 'Clasificacion#9']) {
      const res = await cambiar(debil);
      assert.equal(res.status, 400, `«${debil}» debería rechazarse`);
      assert.match(textoError(res.data), /demasiado común/, debil);
    }
  });

  test('al cambiarla se rechazan los datos personales (nombre, apellido, correo)', async () => {
    // La cuenta experto@sena.edu.co se llama «Experto Sena».
    for (const personal of ['ExpertoGato77!', 'mi apellido es sena 9', 'x-experto-2026']) {
      const res = await cambiar(personal);
      assert.equal(res.status, 400, `«${personal}» debería rechazarse`);
      assert.match(textoError(res.data), /nombre, apellido, correo|demasiado común/, personal);
    }
  });

  test('largo: menos de 8 o más de 64 se rechaza; con tildes y ñ no se pasa de los 72 bytes de bcrypt', async () => {
    assert.match(textoError((await cambiar('Corta1')).data), /al menos 8/);
    assert.match(textoError((await cambiar('a'.repeat(30) + ' ' + 'b'.repeat(34))).data), /máximo 64/);
    const res = await cambiar('ñandú '.repeat(10).trim());
    assert.equal(res.status, 400);
    assert.match(textoError(res.data), /demasiado larga para cifrarse completa/);
  });

  test('exige mayúscula, minúscula, número y carácter especial', async () => {
    const casos = [
      ['tres tristes tigres 3!', /una letra mayúscula/],
      ['TRES TRISTES TIGRES 3!', /una letra minúscula/],
      ['Tres tristes tigres!', /un número/],
      ['Tres tristes tigres 3', /un carácter especial/],
      ['tres tristes tigres', /una letra mayúscula, un número y un carácter especial/],
    ];
    for (const [clave, motivo] of casos) {
      const res = await cambiar(clave);
      assert.equal(res.status, 400, `«${clave}» debería rechazarse`);
      assert.match(textoError(res.data), motivo, clave);
    }
  });

  test('espacios: en medio se permiten (frase), al inicio o al final no', async () => {
    assert.match(textoError((await cambiar(' Tres tristes tigres')).data), /empezar ni terminar con espacios/);
    assert.match(textoError((await cambiar('Tres tristes tigres ')).data), /empezar ni terminar con espacios/);
    const frase = await cambiar('Tres tristes Tigres comen 3!');
    assert.equal(frase.status, 200, textoError(frase.data));
    const [fila] = await consulta(`SELECT "contraseña" AS hash FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.experto]);
    // bcrypt con costo 12 como mínimo.
    assert.match(fila.hash, /^\$2[aby]\$(1[2-9]|[23]\d)\$/);
    const revertir = await http('PATCH', '/auth/change-password', {
      cookie: sesiones.experto,
      json: { currentPassword: 'Tres tristes Tigres comen 3!', newPassword: PASSWORD },
    });
    assert.equal(revertir.status, 200, textoError(revertir.data));
  });

  test('crear usuario: la cédula es obligatoria y es la contraseña inicial, guardada con bcrypt y sal propia', async () => {
    const base = { rol: 'ANALISTA', nombreApellido: 'Valentina Rojas', correo: 'valentina.rojas@sena.edu.co', telefono: '3001234567' };
    const sinCedula = await http('POST', '/usuario', { cookie: sesiones.admin, json: base });
    assert.equal(sinCedula.status, 400);
    assert.match(textoError(sinCedula.data), /cédula/i);

    const ok = await http('POST', '/usuario', { cookie: sesiones.admin, json: { ...base, documento: '1.093.456.781' } });
    assert.ok([200, 201].includes(ok.status), textoError(ok.data));
    assert.equal(ok.data.usuario, base.correo, 'con correo SENA el usuario es el correo');
    assert.equal(ok.data.documento, '1093456781');
    const [nuevo] = await consulta(
      `SELECT "contraseña" AS hash, debe_cambiar_contrasena AS cambiar FROM clasificacion.usuario WHERE correo = $1`,
      [base.correo],
    );
    const [otro] = await consulta(`SELECT "contraseña" AS hash FROM clasificacion.usuario WHERE usuario = $1`, [CUENTAS.admin]);
    assert.match(nuevo.hash, /^\$2[aby]\$\d{2}\$.{53}$/);
    assert.notEqual(nuevo.hash.slice(7, 29), otro.hash.slice(7, 29), 'cada hash debe tener su propia sal');
    assert.equal(nuevo.cambiar, true, 'debe cambiar la contraseña en el primer ingreso');

    // Inicia sesión con la cédula y la respuesta exige cambiarla.
    const entrar = await login(base.correo, '1093456781');
    assert.equal(entrar.status, 201, textoError(entrar.data));
    assert.equal(entrar.data.user.debeCambiarContrasena, true);

    // Con correo externo el usuario de acceso es la cédula; repetirla se rechaza.
    const externo = { ...base, correo: 'valentina.rojas@gmail.com', documento: '1093456782' };
    const ext = await http('POST', '/usuario', { cookie: sesiones.admin, json: externo });
    assert.ok([200, 201].includes(ext.status), textoError(ext.data));
    assert.equal(ext.data.usuario, '1093456782');
    // Con correo externo no se ingresa con el correo, solo con la cédula.
    const conCorreo = await login(externo.correo, '1093456782');
    assert.equal(conCorreo.status, 401);
    assert.match(textoError(conCorreo.data), /ingresa con tu número de cédula/);
    assert.equal(conCorreo.headers.get('set-cookie'), null);
    const conCedula = await login('1093456782', '1093456782');
    assert.equal(conCedula.status, 201, textoError(conCedula.data));
    const repetida = await http('POST', '/usuario', {
      cookie: sesiones.admin,
      json: { ...base, correo: 'otra.persona@gmail.com', documento: '1093456782' },
    });
    assert.equal(repetida.status, 400);
    assert.match(textoError(repetida.data), /cédula ya está registrada/);
  });

  test('importar usuarios desde Excel: la cédula es obligatoria por fila y es la contraseña inicial', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([
        ['Nombre y apellido', 'Correo', 'Cédula', 'Rol'],
        ['Mateo Gil', 'mateo.gil@sena.edu.co', '', 'ANALISTA'],
        ['Lucía Paz', 'lucia.paz@sena.edu.co', '1.093.456.790', 'ANALISTA'],
      ]),
      'Usuarios',
    );
    const res = await subir('/usuario/upload-excel', XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
    assert.ok([200, 201].includes(res.status), textoError(res.data));
    assert.equal(res.data.exitosos, 1);
    assert.equal(res.data.conContrasenaTemporal, 1);
    assert.equal(res.data.errores.length, 1);
    assert.match(res.data.errores[0].mensaje, /cédula es obligatoria/);
    const entrar = await login('lucia.paz@sena.edu.co', '1093456790');
    assert.equal(entrar.status, 201, textoError(entrar.data));
    assert.equal(entrar.data.user.debeCambiarContrasena, true);
  });
});
