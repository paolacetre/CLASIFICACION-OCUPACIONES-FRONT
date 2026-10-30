import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CuocOcupacion } from './cuoc-ocupacion.entity';

@Entity('cuoc_nivel_competencia')
export class CuocNivelCompetencia {
  @PrimaryColumn({ name: 'cod_nivel', type: 'int' })
  codNivel: number;

  @Column({ name: 'nombre_nivel', type: 'text', nullable: true })
  nombreNivel: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  /** Copia creada en Actualización: solo se usa en Análisis, nunca en el catálogo oficial. */
  @Column({ name: 'es_copia', type: 'boolean', default: false })
  esCopia: boolean;

  @Column({ name: 'cod_original', type: 'int', nullable: true })
  codOriginal: number | null;

  @Column({ name: 'creado_en', type: 'timestamptz', nullable: true })
  creadoEn: Date | null;

  @OneToMany(() => CuocOcupacion, (ocup) => ocup.nivelCompetencia)
  ocupaciones: CuocOcupacion[];
}
