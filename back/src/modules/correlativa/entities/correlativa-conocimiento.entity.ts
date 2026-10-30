import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoConocimiento } from '../../cno/entities/cno-conocimiento.entity';
import { CuocConocimiento } from '../../cuoc/entities/cuoc-conocimiento.entity';

@Entity({ schema: 'clasificacion', name: 'correlativa_conocimiento' })
export class CorrelativaConocimiento {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'cod_conocimiento_cno', type: 'int' })
  codConocimientoCno: number;

  @Column({ name: 'nomb_conocimiento_cno', type: 'text', nullable: true })
  nombConocimientoCno: string | null;

  @Column({ name: 'cod_conocimiento_cuoc', type: 'int' })
  codConocimientoCuoc: number;

  @Column({ name: 'nomb_conocimiento_cuoc', type: 'text', nullable: true })
  nombConocimientoCuoc: string | null;

  @Column({ name: 'aplica_correl_conocimientos', type: 'smallint', nullable: true, default: 0 })
  aplicaCorrelConocimientos: number | null;

  @ManyToOne(() => CnoConocimiento)
  @JoinColumn({ name: 'cod_conocimiento_cno' })
  conocimientoCno: CnoConocimiento;

  @ManyToOne(() => CuocConocimiento)
  @JoinColumn({ name: 'cod_conocimiento_cuoc' })
  conocimientoCuoc: CuocConocimiento;
}
