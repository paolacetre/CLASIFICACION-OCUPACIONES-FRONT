import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { RolPermiso } from './rol-permiso.entity';

@Entity('permiso')
export class Permiso {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 100, nullable: true })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @OneToMany(() => RolPermiso, (rp) => rp.permiso)
  rolesPermisos: RolPermiso[];
}
