import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Tabla: usuario_cuenta (migración 025)
 * Lo que el frontend guardaba en localStorage por usuario: preferencias de
 * interfaz, descripción y avatar del perfil, y el perfil de analista con que
 * se precarga Instrumento 3.
 */
@Entity('usuario_cuenta')
export class UsuarioCuenta {
  @PrimaryColumn({ name: 'idusuario', type: 'int' })
  idUsuario: number;

  @Column({ name: 'preferencias', type: 'jsonb', default: () => "'{}'::jsonb" })
  preferencias: Record<string, unknown>;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'avatar', type: 'text', nullable: true })
  avatar: string | null;

  @Column({ name: 'perfil_analista', type: 'jsonb', nullable: true })
  perfilAnalista: Record<string, string> | null;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
