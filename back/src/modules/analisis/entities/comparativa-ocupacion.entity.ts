import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CnoOcupacion } from '../../cno/entities/cno-ocupacion.entity';
import { CuocOcupacion } from '../../cuoc/entities/cuoc-ocupacion.entity';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';

@Entity('comparativa_ocupacion')
export class ComparativaOcupacion {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'estado', type: 'text', nullable: true })
  estado: string;

  @Column({ name: 'fecha_registro', type: 'date', nullable: true })
  fechaRegistro: Date;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario: number;

  // Nulos a proposito: un analisis se puede guardar solo con CNO, solo con CUOC,
  // o con ambos combinados; no siempre hay un par completo que registrar.
  @ManyToOne(() => CnoOcupacion, { nullable: true })
  @JoinColumn({ name: 'cod_ocupacion_cno' })
  ocupacionCno: CnoOcupacion | null;

  @Column({ name: 'cod_ocupacion_cno2', type: 'text', nullable: true })
  codOcupacionCno2: string | null;

  @Column({ name: 'cod_ocupacion_cno3', type: 'text', nullable: true })
  codOcupacionCno3: string | null;

  @ManyToOne(() => CuocOcupacion, { nullable: true })
  @JoinColumn({ name: 'cod_ocupacion_cuoc' })
  ocupacionCuoc: CuocOcupacion | null;

  @Column({ name: 'cod_ocupacion_cuoc2', type: 'text', nullable: true })
  codOcupacionCuoc2: string | null;

  @Column({ name: 'cod_ocupacion_cuoc3', type: 'text', nullable: true })
  codOcupacionCuoc3: string | null;

  @OneToMany(() => Instrumento, (inst) => inst.comparativaOcupacion)
  instrumentos: Instrumento[];
}
