import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CuocGranGrupo } from './cuoc-gran-grupo.entity';
import { CuocSubgrupo } from './cuoc-subgrupo.entity';

@Entity('cuoc_subgrupo_principal')
export class CuocSubgrupoPrincipal {
  @PrimaryColumn({ name: 'cod_subgrupo_p', type: 'text' })
  codSubgrupoP: string;

  @Column({ name: 'nom_subgrupo_p', type: 'text', nullable: true })
  nomSubgrupoP: string;

  @ManyToOne(() => CuocGranGrupo, (grupo) => grupo.subgruposPrincipales)
  @JoinColumn({ name: 'cod_gran_grupo' })
  granGrupo: CuocGranGrupo;

  @OneToMany(() => CuocSubgrupo, (sub) => sub.subgrupoPrincipal)
  subgrupos: CuocSubgrupo[];
}
