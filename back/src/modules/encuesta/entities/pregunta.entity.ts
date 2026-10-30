import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';
import { PreguntaRespuesta } from './pregunta-respuesta.entity';

/**
 * Tabla: pregunta
 * Snapshot de lo que se envía a los expertos: un ítem por fila (nombre,
 * descripción, cada función…) de cada ocupación del instrumento. Los
 * expertos responden sobre estas filas en `pregunta_respuesta`.
 */
@Entity('pregunta')
export class Pregunta {
  @PrimaryGeneratedColumn({ name: 'id_pregunta' })
  idPregunta: number;

  @Column({ name: 'identificador', type: 'text', nullable: true })
  identificador: string;

  @Column({ name: 'detalle', type: 'text', nullable: true })
  detalle: string;

  @Column({ name: 'otro', type: 'text', nullable: true })
  otro: string;

  /**
   * Copia de ocupación a la que pertenece el ítem (migración 028). Un
   * instrumento agrupa hasta 3 ocupaciones; NULL = la principal, que es lo que
   * traen los snapshots anteriores a la migración.
   */
  @Column({ name: 'cod_ocupacion', type: 'text', nullable: true })
  codOcupacion: string | null;

  /**
   * Envío a expertos al que pertenece el ítem (migración 029). Una ronda con
   * respuestas no se reescribe: si el analista reenvía, se escribe la
   * siguiente. Lo vigente es siempre la ronda más alta (ver `rondas-snapshot`).
   */
  @Column({ name: 'ronda', type: 'int', default: 1 })
  ronda: number;

  /**
   * Función o denominación que estaba inactiva en la copia al congelar el
   * snapshot (migración 034). El experto la ve marcada; FALSE en todo lo demás.
   */
  @Column({ name: 'inactivo', type: 'boolean', default: false })
  inactivo: boolean;

  @ManyToOne(() => Instrumento)
  @JoinColumn({ name: 'id_instrumento' })
  instrumento: Instrumento;

  @OneToMany(() => PreguntaRespuesta, (pr) => pr.pregunta)
  respuestas: PreguntaRespuesta[];
}
