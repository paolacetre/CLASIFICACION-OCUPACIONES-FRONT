import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Usuario } from '../../usuario/entities/usuario.entity';
import { Sector } from '../../geografia/entities/sector.entity';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';
import { PreguntaRespuesta } from './pregunta-respuesta.entity';

/**
 * Tabla: respuestas
 * Validación de UN experto sobre un instrumento en una ronda (migración 029,
 * que absorbió la antigua `validacion_experta`): su decisión global y los
 * datos del informante. El veredicto de cada ítem va en `pregunta_respuesta`.
 *
 * El nombre del experto no se guarda: sale de `usuario` por `idusuario`.
 */
@Entity('respuestas')
export class Respuesta {
  @PrimaryGeneratedColumn({ name: 'idrespuesta' })
  idRespuesta: number;

  /** en_revision | aprobada | rechazada | ajustes_solicitados */
  @Column({ name: 'estado', type: 'varchar', length: 40 })
  estado: string;

  /** «Observaciones generales» del formulario de validación. */
  @Column({ name: 'observaciones', type: 'text', nullable: true })
  observaciones: string | null;

  /** Último guardado del experto; lo pone el servidor. */
  @Column({ name: 'fecha_validacion', type: 'timestamptz' })
  fechaValidacion: Date;

  /** Ronda del snapshot (`pregunta.ronda`) que se respondió. */
  @Column({ name: 'ronda', type: 'int', default: 1 })
  ronda: number;

  @Column({ name: 'nombre_apellido', type: 'text', nullable: true })
  nombreApellido: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 45, nullable: true })
  telefono: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  // Etiqueta del catálogo del frontend (DEPARTAMENTOS / MUNICIPIOS_POR_DEPARTAMENTO):
  // no hay tablas de geografía en la BD. Opcionales en BD: el cierre los exige.
  @Column({ name: 'departamento', type: 'text', nullable: true })
  departamento: string | null;

  @Column({ name: 'municipio', type: 'text', nullable: true })
  municipio: string | null;

  @Column({ name: 'empresa_entidad', type: 'text', nullable: true })
  empresaEntidad: string | null;

  @Column({ name: 'cargo', type: 'text', nullable: true })
  cargo: string | null;

  @Column({ name: 'profesión', type: 'text', nullable: true })
  profesion: string | null;

  @Column({ name: 'nombre_ocupacion', type: 'text', nullable: true })
  nombreOcupacion: string | null;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  @ManyToOne(() => Instrumento, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'id_instrumento' })
  instrumento: Instrumento;

  @ManyToOne(() => Usuario, (user) => user.respuestas, { nullable: false })
  @JoinColumn({ name: 'idusuario' })
  usuario: Usuario;

  @ManyToOne(() => Sector, (sec) => sec.respuestas, { nullable: true })
  @JoinColumn({ name: 'sector_codigo' })
  sector: Sector | null;

  @OneToMany(() => PreguntaRespuesta, (pr) => pr.cabecera, { cascade: true })
  preguntaRespuestas: PreguntaRespuesta[];
}
