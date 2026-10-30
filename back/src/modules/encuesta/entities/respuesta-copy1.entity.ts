import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from '../../usuario/entities/usuario.entity';
import { Instrumento } from '../../instrumento2/entities/instrumento.entity';
import { Sector } from '../../geografia/entities/sector.entity';

/**
 * Tabla: respuestas_copy1
 * Estructura amplia (f1-f20, d1-d20, r1-r20, h1-h20, c1-c10) que precedió a
 * la `respuestas` simplificada actual; se conserva bajo este nombre tal como
 * la deja back/documentos/clasificacion.sql (la verdad absoluta del schema).
 */
@Entity('respuestas_copy1')
export class RespuestaCopy1 {
  @PrimaryGeneratedColumn({ name: 'idrespuesta' })
  idRespuesta: number;

  @Column({ name: 'detalle', type: 'text', nullable: true })
  detalle: string;

  @Column({ name: 'respuestascol', type: 'varchar', length: 45, nullable: true })
  respuestascol: string;

  @Column({ name: 'nombre_apellido', type: 'varchar', length: 120, nullable: true })
  nombreApellido: string;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string;

  @Column({ name: 'telefono', type: 'varchar', length: 45, nullable: true })
  telefono: string;

  // Clave del catálogo del frontend, igual que en `respuestas`.
  @Column({ name: 'departamento', type: 'text', nullable: true })
  departamento: string | null;

  @Column({ name: 'municipio', type: 'text', nullable: true })
  municipio: string | null;

  @Column({ name: 'empresa_entidad', type: 'varchar', length: 45, nullable: true })
  empresaEntidad: string;

  @Column({ name: 'cargo', type: 'varchar', length: 45, nullable: true })
  cargo: string;

  @Column({ name: 'profesión', type: 'varchar', length: 45, nullable: true })
  profesion: string;

  @Column({ name: 'nombre', type: 'text', nullable: true })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'area', type: 'text', nullable: true })
  area: string;

  @Column({ name: 'nivel_cualificacion', type: 'text', nullable: true })
  nivelCualificacion: string;

  // ── Funciones f1-f20 ──
  @Column({ name: 'f1', type: 'text', nullable: true }) f1: string;
  @Column({ name: 'f2', type: 'text', nullable: true }) f2: string;
  @Column({ name: 'f3', type: 'text', nullable: true }) f3: string;
  @Column({ name: 'f4', type: 'text', nullable: true }) f4: string;
  @Column({ name: 'f5', type: 'text', nullable: true }) f5: string;
  @Column({ name: 'f6', type: 'text', nullable: true }) f6: string;
  @Column({ name: 'f7', type: 'text', nullable: true }) f7: string;
  @Column({ name: 'f8', type: 'text', nullable: true }) f8: string;
  @Column({ name: 'f9', type: 'text', nullable: true }) f9: string;
  @Column({ name: 'f10', type: 'text', nullable: true }) f10: string;
  @Column({ name: 'f11', type: 'text', nullable: true }) f11: string;
  @Column({ name: 'f12', type: 'text', nullable: true }) f12: string;
  @Column({ name: 'f13', type: 'text', nullable: true }) f13: string;
  @Column({ name: 'f14', type: 'text', nullable: true }) f14: string;
  @Column({ name: 'f15', type: 'text', nullable: true }) f15: string;
  @Column({ name: 'f16', type: 'text', nullable: true }) f16: string;
  @Column({ name: 'f17', type: 'text', nullable: true }) f17: string;
  @Column({ name: 'f18', type: 'text', nullable: true }) f18: string;
  @Column({ name: 'f19', type: 'text', nullable: true }) f19: string;
  @Column({ name: 'f20', type: 'text', nullable: true }) f20: string;

  // ── Destrezas d1-d20 ──
  @Column({ name: 'd1', type: 'text', nullable: true }) d1: string;
  @Column({ name: 'd2', type: 'text', nullable: true }) d2: string;
  @Column({ name: 'd3', type: 'text', nullable: true }) d3: string;
  @Column({ name: 'd4', type: 'text', nullable: true }) d4: string;
  @Column({ name: 'd5', type: 'text', nullable: true }) d5: string;
  @Column({ name: 'd6', type: 'text', nullable: true }) d6: string;
  @Column({ name: 'd7', type: 'text', nullable: true }) d7: string;
  @Column({ name: 'd8', type: 'text', nullable: true }) d8: string;
  @Column({ name: 'd9', type: 'text', nullable: true }) d9: string;
  @Column({ name: 'd10', type: 'text', nullable: true }) d10: string;
  @Column({ name: 'd11', type: 'text', nullable: true }) d11: string;
  @Column({ name: 'd12', type: 'text', nullable: true }) d12: string;
  @Column({ name: 'd13', type: 'text', nullable: true }) d13: string;
  @Column({ name: 'd14', type: 'text', nullable: true }) d14: string;
  @Column({ name: 'd15', type: 'text', nullable: true }) d15: string;
  @Column({ name: 'd16', type: 'text', nullable: true }) d16: string;
  @Column({ name: 'd17', type: 'text', nullable: true }) d17: string;
  @Column({ name: 'd18', type: 'text', nullable: true }) d18: string;
  @Column({ name: 'd19', type: 'text', nullable: true }) d19: string;
  @Column({ name: 'd20', type: 'text', nullable: true }) d20: string;

  // ── Relaciones r1-r20 ──
  @Column({ name: 'r1', type: 'text', nullable: true }) r1: string;
  @Column({ name: 'r2', type: 'text', nullable: true }) r2: string;
  @Column({ name: 'r3', type: 'text', nullable: true }) r3: string;
  @Column({ name: 'r4', type: 'text', nullable: true }) r4: string;
  @Column({ name: 'r5', type: 'text', nullable: true }) r5: string;
  @Column({ name: 'r6', type: 'text', nullable: true }) r6: string;
  @Column({ name: 'r7', type: 'text', nullable: true }) r7: string;
  @Column({ name: 'r8', type: 'text', nullable: true }) r8: string;
  @Column({ name: 'r9', type: 'text', nullable: true }) r9: string;
  @Column({ name: 'r10', type: 'text', nullable: true }) r10: string;
  @Column({ name: 'r11', type: 'text', nullable: true }) r11: string;
  @Column({ name: 'r12', type: 'text', nullable: true }) r12: string;
  @Column({ name: 'r13', type: 'text', nullable: true }) r13: string;
  @Column({ name: 'r14', type: 'text', nullable: true }) r14: string;
  @Column({ name: 'r15', type: 'text', nullable: true }) r15: string;
  @Column({ name: 'r16', type: 'text', nullable: true }) r16: string;
  @Column({ name: 'r17', type: 'text', nullable: true }) r17: string;
  @Column({ name: 'r18', type: 'text', nullable: true }) r18: string;
  @Column({ name: 'r19', type: 'varchar', length: 45, nullable: true }) r19: string;
  @Column({ name: 'r20', type: 'text', nullable: true }) r20: string;

  // ── Habilidades h1-h20 ──
  @Column({ name: 'h1', type: 'text', nullable: true }) h1: string;
  @Column({ name: 'h2', type: 'text', nullable: true }) h2: string;
  @Column({ name: 'h3', type: 'text', nullable: true }) h3: string;
  @Column({ name: 'h4', type: 'text', nullable: true }) h4: string;
  @Column({ name: 'h5', type: 'text', nullable: true }) h5: string;
  @Column({ name: 'h6', type: 'text', nullable: true }) h6: string;
  @Column({ name: 'h7', type: 'text', nullable: true }) h7: string;
  @Column({ name: 'h8', type: 'text', nullable: true }) h8: string;
  @Column({ name: 'h9', type: 'text', nullable: true }) h9: string;
  @Column({ name: 'h10', type: 'text', nullable: true }) h10: string;
  @Column({ name: 'h11', type: 'text', nullable: true }) h11: string;
  @Column({ name: 'h12', type: 'text', nullable: true }) h12: string;
  @Column({ name: 'h13', type: 'text', nullable: true }) h13: string;
  @Column({ name: 'h14', type: 'text', nullable: true }) h14: string;
  @Column({ name: 'h15', type: 'text', nullable: true }) h15: string;
  @Column({ name: 'h16', type: 'text', nullable: true }) h16: string;
  @Column({ name: 'h17', type: 'text', nullable: true }) h17: string;
  @Column({ name: 'h18', type: 'text', nullable: true }) h18: string;
  @Column({ name: 'h19', type: 'text', nullable: true }) h19: string;
  @Column({ name: 'h20', type: 'text', nullable: true }) h20: string;

  // ── Conocimientos c1-c10 ──
  @Column({ name: 'c1', type: 'text', nullable: true }) c1: string;
  @Column({ name: 'c2', type: 'text', nullable: true }) c2: string;
  @Column({ name: 'c3', type: 'text', nullable: true }) c3: string;
  @Column({ name: 'c4', type: 'text', nullable: true }) c4: string;
  @Column({ name: 'c5', type: 'text', nullable: true }) c5: string;
  @Column({ name: 'c6', type: 'text', nullable: true }) c6: string;
  @Column({ name: 'c7', type: 'text', nullable: true }) c7: string;
  @Column({ name: 'c8', type: 'text', nullable: true }) c8: string;
  @Column({ name: 'c9', type: 'text', nullable: true }) c9: string;
  @Column({ name: 'c10', type: 'text', nullable: true }) c10: string;

  // ── Relaciones ──

  @ManyToOne(() => Usuario, (user) => user.respuestasCopy1)
  @JoinColumn({ name: 'usuario_idusuario' })
  usuario: Usuario;

  @ManyToOne(() => Instrumento, (inst) => inst.respuestas)
  @JoinColumn({ name: 'instrumento_idinstrumento' })
  instrumento: Instrumento;

  @ManyToOne(() => Sector, (sec) => sec.respuestasCopy1)
  @JoinColumn({ name: 'sector_codigo' })
  sector: Sector;
}
