import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';
import { CnoConocimiento } from './cno-conocimiento.entity';

@Entity('cno_reg_conocimiento')
export class CnoRegConocimiento {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'nomb_conocimiento', type: 'varchar', length: 255, nullable: true })
  nombConocimiento: string;

  @ManyToOne(() => CnoOcupacion, (ocup) => ocup.conocimientos)
  @JoinColumn({ name: 'cod_ocupacion_cno' })
  ocupacion: CnoOcupacion;

  @ManyToOne(() => CnoConocimiento, (conoc) => conoc.regConocimientos)
  @JoinColumn({ name: 'cod_conocimiento' })
  conocimiento: CnoConocimiento;
}
