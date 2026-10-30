import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CuocRegConocimiento } from './cuoc-reg-conocimiento.entity';

@Entity('cuoc_conocimiento')
export class CuocConocimiento {
  @PrimaryColumn({ name: 'cod_conocimiento', type: 'int' })
  codConocimiento: number;

  @Column({ name: 'nomb_conocimiento', type: 'text', nullable: true })
  nombConocimiento: string;

  @Column({ name: 'desc_conocimiento', type: 'text', nullable: true })
  descConocimiento: string;

  @OneToMany(() => CuocRegConocimiento, (reg) => reg.conocimiento)
  regConocimientos: CuocRegConocimiento[];
}
