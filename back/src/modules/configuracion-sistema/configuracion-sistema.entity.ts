import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Tabla: configuracion_sistema (migración 025)
 * Configuración compartida por todos los usuarios, una fila por clave.
 */
@Entity('configuracion_sistema')
export class ConfiguracionSistema {
  @PrimaryColumn({ name: 'clave', type: 'varchar', length: 60 })
  clave: string;

  @Column({ name: 'valor', type: 'jsonb' })
  valor: Record<string, unknown>;

  @Column({ name: 'idusuario', type: 'int', nullable: true })
  idUsuario: number | null;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
