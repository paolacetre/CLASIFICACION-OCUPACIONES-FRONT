import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';
import { CnoFuncion } from './cno-funcion.entity';

@Entity('cno_reg_funciones')
export class CnoRegFunciones {
  // Clave natural tomada de la propia hoja "Funciones - C.N.O." (ej. "F-0011.01"), no autogenerada.
  @PrimaryColumn({ name: 'codigo', type: 'text' })
  codigo: string;

  @Column({ name: 'desc_funcion_cno', type: 'text', nullable: true })
  descFuncionCno: string;

  @Column({ name: 'estado', type: 'smallint', nullable: true })
  estado: number;

  @ManyToOne(() => CnoOcupacion, (ocup) => ocup.funciones)
  @JoinColumn({ name: 'cno_ocupacion' })
  ocupacion: CnoOcupacion;

  @ManyToOne(() => CnoFuncion, (func) => func.regFunciones)
  @JoinColumn({ name: 'cod_funcion' })
  funcion: CnoFuncion;
}
