import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { Respuesta } from '../../encuesta/entities/respuesta.entity';
import { RespuestaCopy1 } from '../../encuesta/entities/respuesta-copy1.entity';

/**
 * Tabla: sector
 * Sectores económicos de Colombia.
 */
@Entity('sector')
export class Sector {
  @PrimaryColumn({ name: 'codigo', type: 'int' })
  codigo: number;

  @Column({ name: 'nombre', type: 'varchar', length: 255, nullable: true })
  nombre: string;

  @OneToMany(() => Respuesta, (resp) => resp.sector)
  respuestas: Respuesta[];

  @OneToMany(() => RespuestaCopy1, (resp) => resp.sector)
  respuestasCopy1: RespuestaCopy1[];
}
