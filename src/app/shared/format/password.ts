import { AuthError, INVALID_NEW_PASSWORD, WRONG_CURRENT_PASSWORD } from '../auth/auth.service';

/** Largo permitido de una contraseña nueva (el mismo del servidor). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/**
 * Contraseña fuerte, con la misma regla del servidor (`problemaContrasena`):
 * de 8 a 64 caracteres, con al menos una mayúscula, una minúscula, un número y
 * un carácter especial (cualquiera que no sea letra, número ni espacio: * . ! @ #
 * …) y sin espacios al inicio ni al final. El servidor además rechaza claves
 * comunes y datos personales (nombre, correo, cédula): eso solo lo sabe él.
 */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN &&
    password.length <= PASSWORD_MAX &&
    password === password.trim() &&
    /\p{Ll}/u.test(password) &&
    /\p{Lu}/u.test(password) &&
    /\d/.test(password) &&
    /[^\p{L}\d\s]/u.test(password)
  );
}

/**
 * Texto que explica por qué no se pudo cambiar la contraseña: la actual no es
 * esa, o el servidor rechazó la nueva (se muestra su motivo, p. ej. "no uses tu
 * número de documento").
 */
export function passwordChangeError(error: unknown, translate: (key: string) => string): string {
  if (error instanceof AuthError && error.message === WRONG_CURRENT_PASSWORD) {
    return translate('perfil.errorPasswordCurrent');
  }
  if (error instanceof AuthError && error.message === INVALID_NEW_PASSWORD) {
    return error.serverMessage || translate('perfil.errorPasswordWeak');
  }
  return translate('common.errorGeneric');
}
