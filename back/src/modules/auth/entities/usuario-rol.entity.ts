import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Rol } from './rol.entity';
import { RolPermiso } from './rol-permiso.entity';

@Entity('usuario_roles')
export class UsuarioRol {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  @Column({ name: 'idusuario', type: 'int' })
  idUsuario: number;

  @ManyToOne(() => Rol, (rol) => rol.usuarioRoles)
  @JoinColumn({ name: 'id_roles' })
  rol: Rol;

  @OneToMany(() => RolPermiso, (rp) => rp.usuarioRol)
  rolesPermisos: RolPermiso[];
}
