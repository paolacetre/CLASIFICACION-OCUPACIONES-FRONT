import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Permiso } from './permiso.entity';
import { UsuarioRol } from './usuario-rol.entity';

@Entity('roles_permiso')
export class RolPermiso {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  @ManyToOne(() => Permiso, (p) => p.rolesPermisos)
  @JoinColumn({ name: 'permiso_id' })
  permiso: Permiso;

  @ManyToOne(() => UsuarioRol, (ur) => ur.rolesPermisos)
  @JoinColumn({ name: 'usuario_roles_id' })
  usuarioRol: UsuarioRol;
}
