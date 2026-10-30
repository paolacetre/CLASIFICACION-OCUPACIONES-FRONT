import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';
import { CuocConocimiento } from './cuoc-conocimiento.entity';

@Entity('cuoc_reg_conocimientos')
export class CuocRegConocimiento {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'nomb_conocimiento', type: 'text', nullable: true })
  nombConocimiento: string;

  @ManyToOne(() => CuocOcupacion, (ocup) => ocup.regConocimientos)
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacion: CuocOcupacion;

  @ManyToOne(() => CuocConocimiento, (conoc) => conoc.regConocimientos)
  @JoinColumn({ name: 'cod_conocimiento' })
  conocimiento: CuocConocimiento;
}
