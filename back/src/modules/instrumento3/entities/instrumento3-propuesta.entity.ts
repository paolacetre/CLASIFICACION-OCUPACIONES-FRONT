import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';

/**
 * Tabla: instrumento3_propuesta (migración 005)
 *
 * Campos escalares del formulario de Instrumento 3. Las listas (funciones,
 * denominaciones, habilidades, conocimientos, ocupaciones relacionadas) NO
 * viven aquí: se guardan como filas de `pregunta`, que no tiene tope de ítems
 * y es además la fuente que consume Validación Experta.
 */
@Entity('instrumento3_propuesta')
export class Instrumento3Propuesta {
  @PrimaryGeneratedColumn({ name: 'id_propuesta' })
  idPropuesta: number;

  // ── Informante ──
  @Column({ name: 'nombre_apellidos', type: 'text', nullable: true })
  nombreApellidos: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 45, nullable: true })
  telefono: string | null;

  @Column({ name: 'departamento', type: 'text', nullable: true })
  departamento: string | null;

  @Column({ name: 'municipio', type: 'text', nullable: true })
  municipio: string | null;

  @Column({ name: 'empresa_entidad', type: 'text', nullable: true })
  empresaEntidad: string | null;

  @Column({ name: 'cargo', type: 'text', nullable: true })
  cargo: string | null;

  @Column({ name: 'profesion', type: 'text', nullable: true })
  profesion: string | null;

  @Column({ name: 'sector', type: 'text', nullable: true })
  sector: string | null;

  // ── Propuesta ocupacional ──
  @Column({ name: 'cod_ocupacion_cno', type: 'text', nullable: true })
  codOcupacionCNO: string | null;

  @Column({ name: 'cod_ocupacion_cuoc', type: 'text', nullable: true })
  codOcupacionCUOC: string | null;

  @Column({ name: 'nombre_ocupacion', type: 'text', nullable: true })
  nombreOcupacion: string | null;

  @Column({ name: 'cod_area', type: 'int', nullable: true })
  codArea: number | null;

  @Column({ name: 'area_desempeno', type: 'text', nullable: true })
  areaDesempeno: string | null;

  @Column({ name: 'cod_nivel_cualificacion', type: 'int', nullable: true })
  codNivelCualificacion: number | null;

  @Column({ name: 'nivel_cualificacion', type: 'text', nullable: true })
  nivelCualificacion: string | null;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'otras_habilidades', type: 'text', nullable: true })
  otrasHabilidades: string | null;

  @Column({ name: 'otros_conocimientos', type: 'text', nullable: true })
  otrosConocimientos: string | null;

  @ManyToOne(() => Instrumento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_instrumento' })
  instrumento: Instrumento;
}
