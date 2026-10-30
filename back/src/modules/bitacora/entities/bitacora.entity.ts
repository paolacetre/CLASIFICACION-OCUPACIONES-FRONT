import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from '../../usuario/entities/usuario.entity';

/**
 * Tabla: bitacora (migración 020)
 * Una fila por acción real de un usuario (crear ocupación, guardar
 * correlativa, cerrar una validación experta). Alimenta la "Bitácora de
 * Trazabilidad" del panel de Inicio.
 */
@Entity('bitacora')
export class Bitacora {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tipo', type: 'text' })
  tipo: string;

  @Column({ name: 'titulo', type: 'text' })
  titulo: string;

  @Column({ name: 'detalle', type: 'text', nullable: true })
  detalle: string | null;

  @Column({ name: 'fecha', type: 'timestamptz' })
  fecha: Date;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'idusuario' })
  usuario: Usuario;
}
