import { Entity, PrimaryColumn, Column, Generated, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CnoAreaDesempeno } from './cno-area-desempeno.entity';
import { CnoNivelCualificacion } from './cno-nivel-cualificacion.entity';
import { CnoDenominacion } from './cno-denominacion.entity';
import { CnoRegFunciones } from './cno-reg-funciones.entity';
import { CnoRegHabilidad } from './cno-reg-habilidad.entity';
import { CnoRegConocimiento } from './cno-reg-conocimiento.entity';
import { CnoRelacionada } from './cno-relacionada.entity';

@Entity('cno_ocupacion')
export class CnoOcupacion {
  @Column({ name: 'id', type: 'int', generated: 'increment' })
  @Generated('increment')
  id: number;

  @PrimaryColumn({ name: 'cod_ocupacion_cno', type: 'text' })
  codOcupacionCno: string;

  @Column({ name: 'nomb_ocupacion_cno', type: 'text', nullable: true })
  nombOcupacionCno: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'nom_desempeno', type: 'text', nullable: true })
  nomDesempeno: string;

  @Column({ name: 'niveles_cualificacion', type: 'varchar', length: 255, nullable: true })
  nivelesCualificacion: string;

  @Column({ name: 'campo_ocup_cno', type: 'text', nullable: true })
  campoOcupCno: string;

  /** Descripción del campo ocupacional (columna `descripcion_campo` del libro CNO 2026). */
  @Column({ name: 'desc_campo_ocup_cno', type: 'text', nullable: true })
  descCampoOcupCno: string | null;

  @Column({ name: 'estado', type: 'boolean', nullable: true })
  estado: boolean;

  @Column({ name: 'fecha_registro', type: 'date', nullable: true })
  fechaRegistro: Date;

  @Column({ name: 'fecha_inactivacion', type: 'date', nullable: true })
  fechaInactivacion: Date;

  @Column({ name: 'trazabilidad', type: 'text', nullable: true })
  trazabilidad: string;

  @Column({ name: 'cod_ante_ocupacion_cno', type: 'text', nullable: true })
  codAnteOcupacionCno: string;

  @Column({ name: 'id_comparativa', type: 'int', nullable: true })
  idComparativa: number;

  @ManyToOne(() => CnoAreaDesempeno, (desempeno) => desempeno.ocupaciones)
  @JoinColumn({ name: 'cod_desempeno_cno' })
  areaDesempeno: CnoAreaDesempeno;

  @ManyToOne(() => CnoNivelCualificacion, (nivel) => nivel.ocupaciones)
  @JoinColumn({ name: 'cod_cualificacion_cno' })
  nivelCualificacion: CnoNivelCualificacion;

  @OneToMany(() => CnoDenominacion, (denom) => denom.ocupacion)
  denominaciones: CnoDenominacion[];

  @OneToMany(() => CnoRegFunciones, (func) => func.ocupacion)
  funciones: CnoRegFunciones[];

  @OneToMany(() => CnoRegHabilidad, (hab) => hab.ocupacion)
  habilidades: CnoRegHabilidad[];

  @OneToMany(() => CnoRegConocimiento, (conoc) => conoc.ocupacion)
  conocimientos: CnoRegConocimiento[];

  @OneToMany(() => CnoRelacionada, (rel) => rel.ocupacion)
  relacionadas: CnoRelacionada[];
}
