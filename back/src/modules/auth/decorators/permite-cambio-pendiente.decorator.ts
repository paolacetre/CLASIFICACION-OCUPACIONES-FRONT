import { SetMetadata } from '@nestjs/common';

export const PERMITE_CAMBIO_PENDIENTE_KEY = 'permiteCambioPendiente';

/** Código que acompaña al 403 para que el frontend lleve al usuario a cambiar la contraseña. */
export const CODIGO_CAMBIO_CONTRASENA = 'CAMBIO_CONTRASENA_REQUERIDO';

/**
 * Endpoint que un usuario con contraseña temporal SÍ puede usar (ver su perfil
 * y cambiar la contraseña). Todos los demás le responden 403 con
 * `CODIGO_CAMBIO_CONTRASENA` hasta que la cambie.
 */
export const PermiteCambioPendiente = () => SetMetadata(PERMITE_CAMBIO_PENDIENTE_KEY, true);
