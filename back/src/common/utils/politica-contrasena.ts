import * as bcrypt from 'bcryptjs';

/**
 * Reglas para TODA contraseña nueva (cambio de contraseña), en un solo lugar:
 * largo, mayúscula, minúscula, número y carácter especial, más el bloqueo de
 * claves comunes y de datos personales (guía de OWASP).
 *
 * Solo se aplican al crear o cambiar una contraseña: las ya guardadas siguen
 * sirviendo para iniciar sesión aunque no cumplan, así que nadie queda fuera.
 */

export const CONTRASENA_MIN = 8;
export const CONTRASENA_MAX = 64;
/** bcrypt solo usa los primeros 72 bytes y descarta el resto en silencio. */
const BCRYPT_MAX_BYTES = 72;
/**
 * Costo mínimo de bcrypt (2^12 rondas). BCRYPT_SALT puede subirlo, nunca
 * bajarlo: cada punto duplica lo que cuesta probar claves contra un hash robado.
 */
export const BCRYPT_COSTO_MIN = 12;

/** Tipos de carácter exigidos; el frontend muestra la misma lista (shared/utils/politica-contrasena). */
const REQUISITOS: { cumple: (c: string) => boolean; falta: string }[] = [
  { cumple: (c) => /\p{Lu}/u.test(c), falta: 'una letra mayúscula' },
  { cumple: (c) => /\p{Ll}/u.test(c), falta: 'una letra minúscula' },
  { cumple: (c) => /\d/.test(c), falta: 'un número' },
  { cumple: (c) => /[^\p{L}\d\s]/u.test(c), falta: 'un carácter especial (como ! * # $ % & ? @)' },
];

export interface DatosPersonales {
  /** Nombre y apellido juntos; cada palabra se revisa por separado. */
  nombreApellido?: string | null;
  correo?: string | null;
  usuario?: string | null;
  documento?: string | null;
}

/** Claves y palabras que nadie debe poder usar como base (se comparan sin números ni signos). */
const BASES_COMUNES = new Set([
  'password', 'passw', 'pass', 'contrasena', 'clave', 'secreto', 'secret', 'admin', 'administrador',
  'usuario', 'user', 'login', 'root', 'test', 'prueba', 'qwerty', 'qwertyuiop', 'asdf', 'asdfgh',
  'asdfghjkl', 'zxcvbnm', 'abc', 'abcd', 'abcdef', 'abcdefgh', 'letmein', 'welcome', 'bienvenido',
  'iloveyou', 'teamo', 'monkey', 'dragon', 'master', 'football', 'futbol', 'colombia', 'hola',
  // Información obvia de esta aplicación.
  'sena', 'clasificacion', 'ocupacion', 'ocupaciones', 'cno', 'cuoc', 'olo', 'correlativa',
]);

/** Minúsculas y sin tildes, para comparar «Contraseña», «contrasena» y «CONTRASEÑA» igual. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** «11111111», «12345678», «87654321», «abcdefgh», «12341234», «abcabcab». */
function esSecuenciaORepeticion(texto: string): boolean {
  if (texto.length < 4) return false;
  const pasos = new Set<number>();
  for (let i = 1; i < texto.length; i++) pasos.add(texto.charCodeAt(i) - texto.charCodeAt(i - 1));
  if (pasos.size === 1 && [...pasos].every((p) => Math.abs(p) <= 1)) return true;
  for (let largo = 1; largo <= 4; largo++) {
    const bloque = texto.slice(0, largo);
    if (bloque.repeat(Math.ceil(texto.length / largo)).startsWith(texto)) return true;
  }
  return false;
}

function esComun(contrasena: string): boolean {
  const n = normalizar(contrasena);
  const letras = n.replace(/[^a-z]/g, '');
  const alfanumerico = n.replace(/[^a-z0-9]/g, '');
  // «Password*1», «Sena2026*», «Admin123!»: una palabra común con números y signos alrededor.
  if (letras && BASES_COMUNES.has(letras)) return true;
  return esSecuenciaORepeticion(alfanumerico) || (letras.length > 0 && esSecuenciaORepeticion(letras) && letras.length >= 6);
}

/**
 * Partes de los datos del usuario que no deben aparecer dentro de la contraseña.
 * El documento no está: se permite dentro de la contraseña (ver `soloDocumento`),
 * y el usuario de las cuentas con correo externo es la misma cédula.
 */
function partesPersonales(datos: DatosPersonales): string[] {
  const partes = [
    ...(datos.nombreApellido ?? '').split(/\s+/),
    (datos.correo ?? '').split('@')[0],
    datos.usuario?.includes('@') ? datos.usuario.split('@')[0] : (datos.usuario ?? ''),
  ];
  const documento = soloDigitos(datos.documento);
  // Desde 4 caracteres: con 3 un nombre como «Ana» bloquearía «banana».
  return partes
    .map((p) => normalizar(p).replace(/[^a-z0-9]/g, ''))
    .filter((p) => p.length >= 4 && p !== documento);
}

function soloDigitos(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D/g, '');
}

/** Si la contraseña es solo el documento (con o sin puntos y guiones). */
function soloDocumento(contrasena: string, documento: string | null | undefined): boolean {
  const doc = soloDigitos(documento);
  return doc.length > 0 && contrasena.replace(/[.\-\s]/g, '') === doc;
}

/** Motivo por el que la contraseña nueva no sirve, o null si cumple todas las reglas. */
export function problemaContrasena(contrasena: string, datos: DatosPersonales = {}): string | null {
  if (typeof contrasena !== 'string' || contrasena.length < CONTRASENA_MIN) {
    return `La contraseña debe tener al menos ${CONTRASENA_MIN} caracteres.`;
  }
  if (contrasena.length > CONTRASENA_MAX) {
    return `La contraseña admite máximo ${CONTRASENA_MAX} caracteres.`;
  }
  if (Buffer.byteLength(contrasena, 'utf8') > BCRYPT_MAX_BYTES) {
    // Sin este límite bcrypt ignoraría en silencio el final de la contraseña.
    return 'La contraseña es demasiado larga para cifrarse completa: las tildes, la ñ y los emojis ocupan más espacio. Acórtala un poco.';
  }
  if (contrasena !== contrasena.trim()) {
    return 'La contraseña no puede empezar ni terminar con espacios (en medio sí se permiten).';
  }
  if (esComun(contrasena)) {
    return 'Esa contraseña es demasiado común o fácil de adivinar (como «Password1», «Sena2026*» o «12345678»). Usa una frase o una combinación menos obvia.';
  }
  const alfanumerico = normalizar(contrasena).replace(/[^a-z0-9]/g, '');
  if (partesPersonales(datos).some((parte) => alfanumerico.includes(parte))) {
    return 'La contraseña no puede contener tu nombre, apellido, correo ni usuario.';
  }
  if (soloDocumento(contrasena, datos.documento)) {
    return 'Tu número de documento puede ir en la contraseña, pero no solo: agrégale más caracteres.';
  }
  const faltan = REQUISITOS.filter((r) => !r.cumple(contrasena)).map((r) => r.falta);
  if (faltan.length) {
    return `La contraseña debe tener al menos ${faltan.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`;
  }
  return null;
}

/** Si el valor guardado ya es un hash bcrypt ($2a$, $2b$ o $2y$), y no una contraseña en texto plano heredada. */
export function esHashBcrypt(valor: string | null | undefined): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(valor ?? '');
}

/** Hash bcrypt con sal aleatoria propia (genSalt) y el costo configurado (BCRYPT_SALT), nunca menor a BCRYPT_COSTO_MIN. */
export async function cifrarContrasena(contrasena: string, rondas: number | undefined): Promise<string> {
  return bcrypt.hash(contrasena, await bcrypt.genSalt(Math.max(rondas || 0, BCRYPT_COSTO_MIN)));
}
