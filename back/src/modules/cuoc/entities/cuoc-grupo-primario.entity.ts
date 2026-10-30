import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CuocSubgrupo } from './cuoc-subgrupo.entity';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_grupo_primario')
export class CuocGrupoPrimario {
  @PrimaryColumn({ name: 'cod_grupo_prim', type: 'text' })
  codGrupoPrim: string;

  @Column({ name: 'nom_grupo_prim', type: 'text', nullable: true })
  nomGrupoPrim: string;

  @ManyToOne(() => CuocSubgrupo, (sub) => sub.gruposPrimarios)
  @JoinColumn({ name: 'cod_subgrupo_c' })
  subgrupo: CuocSubgrupo;

  @OneToMany(() => CuocOcupacion, (ocup) => ocup.grupoPrimario)
  ocupaciones: CuocOcupacion[];
}
