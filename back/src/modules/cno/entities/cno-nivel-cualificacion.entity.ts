import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CnoOcupacion } from './cno-ocupacion.entity';

@Entity('cno_nivel_cualificacion')
export class CnoNivelCualificacion {
  @PrimaryColumn({ name: 'cod_cualificacion', type: 'text' })
  codCualificacion: string;

  @Column({ name: 'niveles_cualificacion', type: 'varchar', length: 255, nullable: true })
  nivelesCualificacion: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  /** Copia creada en Actualización: solo se usa en Análisis, nunca en el catálogo oficial. */
  @Column({ name: 'es_copia', type: 'boolean', default: false })
  esCopia: boolean;

  @Column({ name: 'cod_original', type: 'text', nullable: true })
  codOriginal: string | null;

  @Column({ name: 'creado_en', type: 'timestamptz', nullable: true })
  creadoEn: Date | null;

  @OneToMany(() => CnoOcupacion, (ocupacion) => ocupacion.nivelCualificacion)
  ocupaciones: CnoOcupacion[];
}
