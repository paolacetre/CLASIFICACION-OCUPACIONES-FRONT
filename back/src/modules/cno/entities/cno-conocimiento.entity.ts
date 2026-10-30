import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CnoRegConocimiento } from './cno-reg-conocimiento.entity';

@Entity('cno_conocimiento')
export class CnoConocimiento {
  // Antes @PrimaryGeneratedColumn: aunque el codigo siempre pasa el codigo real
  // del Excel al crear el registro, con esa anotacion TypeORM ignoraba ese valor
  // e insertaba usando su propio contador (nextval), asignando IDs en el orden
  // de primera aparicion en vez del codigo oficial CNO. Con @PrimaryColumn se
  // respeta el valor explicito que ya se le pasa en buildNew() en cno-bulk-upload.service.ts.
  // La columna es SERIAL en la BD (migracion 025): sin codigo, lo asigna la secuencia,
  // que se reposiciona tras cada insercion explicita (resincronizarSecuencia).
  @PrimaryColumn({ name: 'cod_conocimiento', type: 'int' })
  codConocimiento: number;

  @Column({ name: 'nomb_conocimiento', type: 'varchar', length: 255, nullable: true })
  nombConocimiento: string;

  @Column({ name: 'desc_conocimiento', type: 'text', nullable: true })
  descConocimiento: string;

  @OneToMany(() => CnoRegConocimiento, (reg) => reg.conocimiento)
  regConocimientos: CnoRegConocimiento[];
}
