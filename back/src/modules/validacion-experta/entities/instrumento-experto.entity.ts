import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';
import { Usuario } from '../../usuario/entities/usuario.entity';

/**
 * Tabla: instrumento_experto (migración 029)
 * Expertos a los que se envió un instrumento en una ronda. Los elige quien lo
 * envía (analista o administrador); el instrumento se cierra solo cuando
 * todos los asignados cierran su validación.
 */
@Entity('instrumento_experto')
export class InstrumentoExperto {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'ronda', type: 'int', default: 1 })
  ronda: number;

  @Column({ name: 'fecha_asignacion', type: 'timestamptz' })
  fechaAsignacion: Date;

  @ManyToOne(() => Instrumento, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'id_instrumento' })
  instrumento: Instrumento;

  @ManyToOne(() => Usuario, { nullable: false })
  @JoinColumn({ name: 'idusuario' })
  usuario: Usuario;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'asignado_por' })
  asignadoPor: Usuario | null;
}
