import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CuocSubgrupoPrincipal } from './cuoc-subgrupo-principal.entity';
import { CuocGrupoPrimario } from './cuoc-grupo-primario.entity';

@Entity('cuoc_subgrupo')
export class CuocSubgrupo {
  @PrimaryColumn({ name: 'cod_subgrupo_c', type: 'text' })
  codSubgrupoC: string;

  @Column({ name: 'nom_subgrupo_c', type: 'text', nullable: true })
  nomSubgrupoC: string;

  @ManyToOne(() => CuocSubgrupoPrincipal, (sub) => sub.subgrupos)
  @JoinColumn({ name: 'cod_subgrupo_p' })
  subgrupoPrincipal: CuocSubgrupoPrincipal;

  @OneToMany(() => CuocGrupoPrimario, (gp) => gp.subgrupo)
  gruposPrimarios: CuocGrupoPrimario[];
}
