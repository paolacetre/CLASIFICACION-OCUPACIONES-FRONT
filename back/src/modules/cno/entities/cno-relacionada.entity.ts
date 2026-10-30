import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';

@Entity('cno_relacionadas')
export class CnoRelacionada {
  @PrimaryGeneratedColumn({ name: 'codigo' })
  codigo: number;

  @Column({ name: 'nombre_ocupacion', type: 'text', nullable: true })
  nombreOcupacion: string;

  @Column({ name: 'codigo_ocupacion', type: 'text', nullable: true })
  codigoOcupacion: string;

  @Column({ name: 'nombre_cno_relacionada', type: 'text', nullable: true })
  nombreCnoRelacionada: string;

  @ManyToOne(() => CnoOcupacion, (ocup) => ocup.relacionadas)
  @JoinColumn({ name: 'cod_ocupacion_cno' })
  ocupacion: CnoOcupacion;
}
