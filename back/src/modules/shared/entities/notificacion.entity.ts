import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('notificacion')
export class Notificacion {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  idUsuario?: number | null;

  @Column({ name: 'rol_destino', type: 'varchar', length: 50, nullable: true })
  rolDestino?: string | null;

  @Column({ name: 'titulo', type: 'varchar', length: 255 })
  titulo: string;

  @Column({ name: 'mensaje', type: 'text' })
  mensaje: string;

  @Column({ name: 'tipo_evento', type: 'varchar', length: 100 })
  tipoEvento: string;

  @Column({ name: 'id_instrumento', type: 'int', nullable: true })
  idInstrumento?: number | null;

  @Column({ name: 'ruta', type: 'varchar', length: 255, nullable: true })
  ruta?: string | null;

  @Column({ name: 'leida', type: 'boolean', default: false })
  leida: boolean;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;
}
