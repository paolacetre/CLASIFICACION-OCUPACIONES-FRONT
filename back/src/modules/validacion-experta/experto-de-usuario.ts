import { Usuario } from '../usuario/entities/usuario.entity';

/**
 * Identidad de un experto tal como se muestra: el nombre sale de `usuario`
 * (ya no se copia en la validación); el correo si aún no tiene nombre.
 */
export function expertoDeUsuario(usuario: Pick<Usuario, 'idUsuario' | 'nombreApellido' | 'correo'> | null | undefined): {
  idUsuario: number;
  nombre: string;
  correo: string;
} {
  const nombre = (usuario?.nombreApellido ?? '').trim();
  return {
    idUsuario: usuario?.idUsuario ?? 0,
    nombre: nombre || usuario?.correo || '',
    correo: usuario?.correo ?? '',
  };
}
