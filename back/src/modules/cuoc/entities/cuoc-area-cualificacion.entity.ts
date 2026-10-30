import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_area_cualificacion')
export class CuocAreaCualificacion {
  @PrimaryColumn({ name: 'codigo', type: 'text' })
  codigo: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @OneToMany(() => CuocOcupacion, (ocup) => ocup.areaCualificacion)
  ocupaciones: CuocOcupacion[];
}
