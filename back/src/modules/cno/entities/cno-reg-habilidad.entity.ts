import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { HabilidadDestreza } from '../../shared/entities/habilidad-destreza.entity';
import { CnoOcupacion } from './cno-ocupacion.entity';

@Entity('cno_reg_habilidad')
export class CnoRegHabilidad {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'nomb_hab_dest', type: 'text', nullable: true })
  nombHabDest: string;

  @ManyToOne(() => HabilidadDestreza)
  @JoinColumn({ name: 'codigo_habilidad' })
  habilidadDestreza: HabilidadDestreza;

  @ManyToOne(() => CnoOcupacion, (ocup) => ocup.habilidades)
  @JoinColumn({ name: 'cod_ocupacion_cno' })
  ocupacion: CnoOcupacion;
}
