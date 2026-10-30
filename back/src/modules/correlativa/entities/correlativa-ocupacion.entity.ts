import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoOcupacion } from '../../cno/entities/cno-ocupacion.entity';
import { CuocOcupacion } from '../../cuoc/entities/cuoc-ocupacion.entity';

/**
 * Correlación CNO ↔ CUOC a nivel de ocupación (clasificacion.correlativa_ocupacion).
 */
@Entity({ schema: 'clasificacion', name: 'correlativa_ocupacion' })
export class CorrelativaOcupacion {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'cno_ocupacion_cno', type: 'text' })
  cnoOcupacionCno: string;

  @Column({ name: 'nomb_ocupacion_cno', type: 'text', nullable: true })
  nombOcupacionCno: string | null;

  @Column({ name: 'cuoc_ocupacion_cuoc', type: 'text' })
  cuocOcupacionCuoc: string;

  @Column({ name: 'nomb_ocupacion_cuoc', type: 'text', nullable: true })
  nombOcupacionCuoc: string | null;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string | null;

  @ManyToOne(() => CnoOcupacion)
  @JoinColumn({ name: 'cno_ocupacion_cno', referencedColumnName: 'codOcupacionCno' })
  ocupacionCno: CnoOcupacion;

  @ManyToOne(() => CuocOcupacion)
  @JoinColumn({ name: 'cuoc_ocupacion_cuoc', referencedColumnName: 'codOcupacionCuoc' })
  ocupacionCuoc: CuocOcupacion;
}
