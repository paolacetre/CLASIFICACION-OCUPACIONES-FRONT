import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from '../../usuario/entities/usuario.entity';
import { Respuesta } from './respuesta.entity';
import { Pregunta } from './pregunta.entity';

/**
 * Tabla: pregunta_respuesta
 * Veredicto de un experto sobre un ítem del snapshot (`pregunta`), dentro de
 * su validación (`respuestas`). Migración 029, que absorbió la antigua
 * `validacion_experta_campo`.
 *
 * El texto evaluado y la ocupación del ítem salen de `pregunta` por la FK: el
 * snapshot se congela al enviarlo a expertos, así que no se copian aquí.
 */
@Entity('pregunta_respuesta')
export class PreguntaRespuesta {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  /** aplica | no_aplica | requiere_ajuste | propuesta_mejora. NULL = sin calificar aún. */
  @Column({ name: 'respuesta', type: 'text', nullable: true })
  respuesta: string | null;

  /** Comentario del experto sobre el ítem. `respuesta` dice si es una propuesta de mejora. */
  @Column({ name: 'otro', type: 'text', nullable: true })
  otro: string | null;

  /** Texto que el experto propone para el ítem (descripción y área de desempeño). */
  @Column({ name: 'valor_propuesto', type: 'text', nullable: true })
  valorPropuesto: string | null;

  /** El mismo de la cabecera. */
  @ManyToOne(() => Usuario, { nullable: false })
  @JoinColumn({ name: 'idusuario' })
  usuario: Usuario;

  @ManyToOne(() => Respuesta, (resp) => resp.preguntaRespuestas, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'idrespuesta' })
  cabecera: Respuesta;

  @ManyToOne(() => Pregunta, (preg) => preg.respuestas, { nullable: false })
  @JoinColumn({ name: 'id_pregunta' })
  pregunta: Pregunta;
}
