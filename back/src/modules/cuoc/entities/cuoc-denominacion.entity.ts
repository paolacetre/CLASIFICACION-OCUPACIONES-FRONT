import { Entity, PrimaryColumn, Column, Generated, ManyToOne, JoinColumn } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_denominacion')
export class CuocDenominacion {
  @Column({ name: 'codigo', type: 'int', generated: 'increment' })
  @Generated('increment')
  codigo: number;

  @PrimaryColumn({ name: 'cod_denominacion', type: 'text' })
  codDenominacion: string;

  @Column({ name: 'nom_denominacion', type: 'text', nullable: true })
  nomDenominacion: string;

  @Column({ name: 'fuente_denom', type: 'text', nullable: true })
  fuenteDenom: string;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string;

  @Column({ name: 'fecha_registro', type: 'timestamp', nullable: true })
  fechaRegistro: Date;

  @Column({ name: 'estado', type: 'smallint', default: 1 })
  estado: number;

  @ManyToOne(() => CuocOcupacion, (ocup) => ocup.denominaciones)
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacion: CuocOcupacion;
}
