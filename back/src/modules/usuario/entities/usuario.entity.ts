import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { Respuesta } from '../../encuesta/entities/respuesta.entity';
import { RespuestaCopy1 } from '../../encuesta/entities/respuesta-copy1.entity';

@Entity('usuario')
export class Usuario {
  @PrimaryColumn({ name: 'idusuario', type: 'int' })
  idUsuario: number;

  @Column({ name: 'usuario', type: 'varchar', length: 100, nullable: true })
  usuario: string;

  @Column({ name: 'contraseña', type: 'varchar', length: 255, nullable: true })
  contrasena: string;

  /** Nombre y apellido juntos, en una sola columna. */
  @Column({ name: 'nombre_apellido', type: 'text', nullable: true })
  nombreApellido: string;

  @Column({ name: 'correo', type: 'varchar', length: 255, nullable: true })
  correo: string;

  @Column({ name: 'telefono', type: 'varchar', length: 50, nullable: true })
  telefono?: string;

  /** Cédula, solo dígitos. Identificador de login y contraseña inicial de los importados sin contraseña. */
  @Column({ name: 'documento', type: 'varchar', length: 20, nullable: true })
  documento?: string | null;

  /** La contraseña actual es temporal: hasta cambiarla, el usuario solo puede cambiarla. */
  @Column({ name: 'debe_cambiar_contrasena', type: 'boolean', default: false })
  debeCambiarContrasena: boolean;

  @Column({ name: 'origen', type: 'varchar', length: 50, default: 'MANUAL', nullable: true })
  origen: string;

  @Column({ name: 'estado', type: 'smallint', nullable: true })
  estado: number;

  @Column({ name: 'fecha_creacion', type: 'date', nullable: true })
  fechaCreacion: Date;

  @OneToMany(() => Respuesta, (resp) => resp.usuario)
  respuestas: Respuesta[];

  @OneToMany(() => RespuestaCopy1, (resp) => resp.usuario)
  respuestasCopy1: RespuestaCopy1[];
}
