import { HojaPlantilla } from '../../common/utils/plantilla-excel.util';
import { Role } from '../../common/enums/role.enum';

/**
 * Plantilla de importación de usuarios. Los encabezados son los que reconocen
 * `UsuarioService.uploadExcel` y la pantalla de Usuarios (que lee la primera
 * hoja). Si la columna Rol queda vacía, la pantalla abre el asistente para
 * asignar el rol usuario por usuario.
 */
export const PLANTILLA_USUARIOS: HojaPlantilla = {
  nombre: 'Usuarios',
  columnas: [
    { encabezado: 'Nombre y apellido', obligatoria: false, nota: 'Nombre completo en una sola celda.' },
    { encabezado: 'Correo', obligatoria: true, nota: 'Correo electrónico válido. No puede estar ya registrado.' },
    {
      encabezado: 'Cédula',
      obligatoria: true,
      nota: 'Entre 5 y 12 dígitos, no repetida. Es la contraseña inicial (deberá cambiarse al ingresar) y, si el correo no es del SENA, el usuario de acceso.',
    },
    {
      encabezado: 'Rol',
      obligatoria: false,
      nota: `Uno de: ${Object.values(Role).join(', ')}. Si se deja vacía, se asigna en el asistente de la pantalla.`,
    },
  ],
};
