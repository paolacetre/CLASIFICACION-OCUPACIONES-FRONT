import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CuocDestreza } from '../../cuoc/entities/cuoc-destreza.entity';

/**
 * Tabla: habilidad_destreza
 * Catálogo compartido de habilidades y destrezas, utilizado tanto
 * por el dominio CNO como por el dominio CUOC.
 */
@Entity('habilidad_destreza')
export class HabilidadDestreza {
  // @PrimaryColumn para respetar el código que trae el Excel; la columna es SERIAL
  // en la BD (migración 025) y la secuencia se reposiciona tras cada inserción.
  @PrimaryColumn({ name: 'cod_hab_dest', type: 'int' })
  codHabDest: number;

  @Column({ name: 'nomb_hab_dest', type: 'varchar', length: 255, nullable: true })
  nombHabDest: string;

  @Column({ name: 'desc_hab_dest', type: 'text', nullable: true })
  descHabDest: string;

  @OneToMany(() => CuocDestreza, (dest) => dest.habilidadDestreza)
  cuocDestrezas: CuocDestreza[];
}
