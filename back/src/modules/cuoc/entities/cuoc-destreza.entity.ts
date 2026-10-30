import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { HabilidadDestreza } from '../../shared/entities/habilidad-destreza.entity';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_destreza')
export class CuocDestreza {
  @PrimaryGeneratedColumn({ name: 'cod_destrezas_cuoc' })
  codDestrezasCuoc: number;

  @Column({ name: 'nomb_hab_dest', type: 'text', nullable: true })
  nombHabDest: string;

  @ManyToOne(() => HabilidadDestreza, (hab) => hab.cuocDestrezas)
  @JoinColumn({ name: 'codigo_destreza' })
  habilidadDestreza: HabilidadDestreza;

  @ManyToOne(() => CuocOcupacion, (ocup) => ocup.destrezas)
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacion: CuocOcupacion;
}
