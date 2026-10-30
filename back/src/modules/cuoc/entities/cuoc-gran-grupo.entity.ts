import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CuocSubgrupoPrincipal } from './cuoc-subgrupo-principal.entity';

@Entity('cuoc_gran_grupo')
export class CuocGranGrupo {
  @PrimaryColumn({ name: 'cod_gran_grupo', type: 'text' })
  codGranGrupo: string;

  @Column({ name: 'nom_gran_grupo', type: 'text', nullable: true })
  nomGranGrupo: string;

  @OneToMany(() => CuocSubgrupoPrincipal, (sub) => sub.granGrupo)
  subgruposPrincipales: CuocSubgrupoPrincipal[];
}
