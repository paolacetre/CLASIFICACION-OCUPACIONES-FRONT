import { Entity, PrimaryColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';

@Entity('cno_denominacion')
@Index(['codDenominacionCno'], { unique: true })
export class CnoDenominacion {
  @PrimaryColumn({ name: 'codigo', type: 'int', generated: 'increment' })
  codigo: number;

  @PrimaryColumn({ name: 'cod_denominacion_cno', type: 'text' })
  codDenominacionCno: string;

  @Column({ name: 'desc_denominacion', type: 'text', nullable: true })
  descDenominacion: string;

  @Column({ name: 'estado', type: 'smallint', nullable: true })
  estado: number;

  @Column({ name: 'fecha_reg', type: 'timestamp', nullable: true })
  fechaReg: Date;

  @Column({ name: 'fecha_inactivacion', type: 'timestamp', nullable: true })
  fechaInactivacion: Date;

  @ManyToOne(() => CnoOcupacion, (ocup) => ocup.denominaciones)
  @JoinColumn({ name: 'cno_cod_ocupacion' })
  ocupacion: CnoOcupacion;
}
