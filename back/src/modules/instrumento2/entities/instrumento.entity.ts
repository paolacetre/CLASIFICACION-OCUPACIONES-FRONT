import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ComparativaOcupacion } from '../../analisis/entities/comparativa-ocupacion.entity';
import { Usuario } from '../../usuario/entities/usuario.entity';
import { RespuestaCopy1 } from '../../encuesta/entities/respuesta-copy1.entity';
import { Pregunta } from '../../encuesta/entities/pregunta.entity';

@Entity('instrumento')
export class Instrumento {
  @PrimaryGeneratedColumn({ name: 'idinstrumento' })
  idInstrumento: number;

  @Column({ name: 'tipo', type: 'text', nullable: true })
  tipo: string;

  @Column({ name: 'ocupacion', type: 'text' })
  ocupacion: string;

  @Column({ name: 'fecha', type: 'timestamp', nullable: true })
  fecha: Date;

  @Column({ name: 'estado', type: 'varchar', length: 45, nullable: true })
  estado: string;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'idusuario' })
  usuario: Usuario;

  @ManyToOne(() => ComparativaOcupacion, (co) => co.instrumentos)
  @JoinColumn({ name: 'comparativa_ocupacion_id' })
  comparativaOcupacion: ComparativaOcupacion;

  @OneToMany(() => RespuestaCopy1, (resp) => resp.instrumento)
  respuestas: RespuestaCopy1[];

  @OneToMany(() => Pregunta, (preg) => preg.instrumento)
  preguntas: Pregunta[];
}
