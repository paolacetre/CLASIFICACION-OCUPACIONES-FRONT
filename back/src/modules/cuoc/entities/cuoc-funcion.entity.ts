import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_funciones')
export class CuocFuncion {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'cod_funcion_cuoc', type: 'text', nullable: true })
  codFuncionCuoc: string;

  @Column({ name: 'nom_funcion_cuoc', type: 'text', nullable: true })
  nomFuncionCuoc: string;

  @Column({ name: 'fecha_registro', type: 'date', nullable: true })
  fechaRegistro: Date;

  @Column({ name: 'estado', type: 'smallint', nullable: true })
  estado: number;

  @Column({ name: 'fecha_inactivo', type: 'timestamp', nullable: true })
  fechaInactivo: Date;

  @ManyToOne(() => CuocOcupacion, (ocup) => ocup.funciones)
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacion: CuocOcupacion;
}
