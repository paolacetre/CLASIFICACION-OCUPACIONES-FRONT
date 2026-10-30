import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CnoRegFunciones } from './cno-reg-funciones.entity';

@Entity('cno_funcion')
export class CnoFuncion {
  @PrimaryColumn({ name: 'cod_funcion', type: 'text' })
  codFuncion: string;

  @Column({ name: 'desc_funcion_cno', type: 'text', nullable: true })
  descFuncionCno: string;

  @OneToMany(() => CnoRegFunciones, (reg) => reg.funcion)
  regFunciones: CnoRegFunciones[];
}
