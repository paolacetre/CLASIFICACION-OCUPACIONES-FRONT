import { Entity, PrimaryColumn, Column, Generated, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CuocGrupoPrimario } from './cuoc-grupo-primario.entity';
import { CuocNivelCompetencia } from './cuoc-nivel-competencia.entity';
import { CuocAreaCualificacion } from './cuoc-area-cualificacion.entity';
import { CuocDenominacion } from './cuoc-denominacion.entity';
import { CuocFuncion } from './cuoc-funcion.entity';
import { CuocRegConocimiento } from './cuoc-reg-conocimiento.entity';
import { CuocDestreza } from './cuoc-destreza.entity';
import { CuocOcupacionAfin } from './cuoc-ocupacion-afin.entity';

@Entity('cuoc_ocupacion')
export class CuocOcupacion {
  @Column({ name: 'id', type: 'int', generated: 'increment' })
  @Generated('increment')
  id: number;

  @PrimaryColumn({ name: 'cod_ocupacion_cuoc', type: 'text' })
  codOcupacionCuoc: string;

  @Column({ name: 'nom_ocupacion_cuoc', type: 'text', nullable: true })
  nomOcupacionCuoc: string;

  @Column({ name: 'desc_ocupacion_cuoc', type: 'text', nullable: true })
  descOcupacionCuoc: string;

  @Column({ name: 'nombre', type: 'text', nullable: true })
  nombre: string;

  @Column({ name: 'nombre_nivel', type: 'text', nullable: true })
  nombreNivel: string;

  @Column({ name: 'fecha_registro', type: 'date', nullable: true })
  fechaRegistro: Date;

  @Column({ name: 'estado', type: 'boolean', nullable: true })
  estado: boolean;

  @Column({ name: 'fecha_inactivacion', type: 'date', nullable: true })
  fechaInactivacion: Date;

  @Column({ name: 'trazabilidad', type: 'text', nullable: true })
  trazabilidad: string;

  @Column({ name: 'cod_ante_ocupacion_cuoc', type: 'text', nullable: true })
  codAnteOcupacionCuoc: string;

  @Column({ name: 'id_comparativa', type: 'int', nullable: true })
  idComparativa: number;

  @ManyToOne(() => CuocGrupoPrimario, (gp) => gp.ocupaciones)
  @JoinColumn({ name: 'cod_grupo_prim' })
  grupoPrimario: CuocGrupoPrimario;

  @ManyToOne(() => CuocNivelCompetencia, (nivel) => nivel.ocupaciones)
  @JoinColumn({ name: 'cod_nivel_cuoc' })
  nivelCompetencia: CuocNivelCompetencia;

  @ManyToOne(() => CuocAreaCualificacion, (area) => area.ocupaciones)
  @JoinColumn({ name: 'codigo_area_cuoc' })
  areaCualificacion: CuocAreaCualificacion;

  @OneToMany(() => CuocDenominacion, (denom) => denom.ocupacion)
  denominaciones: CuocDenominacion[];

  @OneToMany(() => CuocFuncion, (func) => func.ocupacion)
  funciones: CuocFuncion[];

  @OneToMany(() => CuocRegConocimiento, (reg) => reg.ocupacion)
  regConocimientos: CuocRegConocimiento[];

  @OneToMany(() => CuocDestreza, (dest) => dest.ocupacion)
  destrezas: CuocDestreza[];

  @OneToMany(() => CuocOcupacionAfin, (afin) => afin.ocupacion)
  ocupacionesAfines: CuocOcupacionAfin[];
}
