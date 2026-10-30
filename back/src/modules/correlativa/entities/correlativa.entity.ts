import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoDenominacion } from '../../cno/entities/cno-denominacion.entity';
import { CuocDenominacion } from '../../cuoc/entities/cuoc-denominacion.entity';

@Entity({ schema: 'clasificacion', name: 'correlativa_denominacion' })
export class Correlativa {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'cod_ocupacion_cno', type: 'text' })
  codOcupacionCno: string;

  @Column({ name: 'desc_denominacion_cno', type: 'text', nullable: true })
  descDenominacionCno: string;

  @Column({ name: 'desc_denominacion_cuoc', type: 'text', nullable: true })
  descDenominacionCuoc: string;

  @Column({ name: 'cod_ocupacion_cuoc', type: 'text' })
  codOcupacionCuoc: string;

  @Column({ name: 'estado', type: 'boolean', nullable: true })
  estado: boolean;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string;

  @ManyToOne(() => CnoDenominacion)
  @JoinColumn({ name: 'cod_denominacion_cno', referencedColumnName: 'codDenominacionCno' })
  denominacionCno: CnoDenominacion;

  @ManyToOne(() => CuocDenominacion)
  @JoinColumn({ name: 'cod_denominacion_cuoc' })
  denominacionCuoc: CuocDenominacion;
}
