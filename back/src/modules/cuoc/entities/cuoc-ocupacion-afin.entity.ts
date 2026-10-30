import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_ocupacion_afin')
export class CuocOcupacionAfin {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'nombre_ocupacion', type: 'text', nullable: true })
  nombreOcupacion: string;

  @Column({ name: 'codigo_ocupacion', type: 'text', nullable: true })
  codigoOcupacion: string;

  @Column({ name: 'nombre_cno_afin', type: 'text', nullable: true })
  nombreCnoAfin: string;

  @ManyToOne(() => CuocOcupacion, (ocup) => ocup.ocupacionesAfines)
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacion: CuocOcupacion;
}
