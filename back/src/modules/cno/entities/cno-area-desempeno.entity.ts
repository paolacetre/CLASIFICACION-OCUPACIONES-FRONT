import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';

@Entity('cno_area_desempeno')
export class CnoAreaDesempeno {
  @PrimaryColumn({ name: 'cod_desempeno', type: 'text' })
  codDesempeno: string;

  @Column({ name: 'nom_desempeno', type: 'text', nullable: true })
  nomDesempeno: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @OneToMany(() => CnoOcupacion, (ocupacion) => ocupacion.areaDesempeno)
  ocupaciones: CnoOcupacion[];
}
