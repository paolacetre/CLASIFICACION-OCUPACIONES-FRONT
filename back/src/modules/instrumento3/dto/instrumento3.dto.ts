import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { Instrumento3Estado } from '../enums/instrumento3-estado.enum';
import { PreguntaSnapshotDto } from '../../instrumento2/dto/pregunta-snapshot.dto';

/**
 * Cuerpo de `POST /api/instrumento3`. Espeja `Instrumento3Form` del frontend.
 * Todo es opcional salvo el nombre de la ocupación: el analista guarda
 * borradores incompletos y los va completando.
 */
export class CreateInstrumento3Dto {
  // ── Informante ──
  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional() @IsString()
  fecha?: string;

  @ApiPropertyOptional({ example: 'Ana María Ruiz López' })
  @IsOptional() @IsString() @MaxLength(200)
  nombreApellidos?: string;

  @ApiPropertyOptional({ example: 'ana.ruiz@sena.edu.co' })
  @IsOptional() @IsEmail({}, { message: 'El email del informante no es válido' })
  email?: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional() @IsString() @MaxLength(45)
  telefono?: string;

  @ApiPropertyOptional({ example: 'antioquia' })
  @IsOptional() @IsString()
  departamento?: string;

  @ApiPropertyOptional({ example: 'medellin' })
  @IsOptional() @IsString()
  municipio?: string;

  @ApiPropertyOptional({ example: 'SENA' })
  @IsOptional() @IsString()
  empresaEntidad?: string;

  @ApiPropertyOptional({ example: 'Instructora' })
  @IsOptional() @IsString()
  cargo?: string;

  @ApiPropertyOptional({ example: 'Ingeniera de sistemas' })
  @IsOptional() @IsString()
  profesion?: string;

  @ApiPropertyOptional({ example: 'salud' })
  @IsOptional() @IsString()
  sector?: string;

  // ── Propuesta ocupacional ──
  @ApiProperty({ example: 'Técnico en Desarrollo Web Full Stack' })
  @IsString() @MaxLength(500)
  nombreOcupacion: string;

  @ApiPropertyOptional({ example: '2172-01' })
  @IsOptional() @IsString()
  codOcupacionCNO?: string;

  @ApiPropertyOptional({ example: '2513-01' })
  @IsOptional() @IsString()
  codOcupacionCUOC?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional() @IsInt()
  codArea?: number;

  @ApiPropertyOptional({ example: '2. CIENCIAS NATURALES, APLICADAS Y RELACIONADAS' })
  @IsOptional() @IsString()
  areaDesempeno?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional() @IsInt()
  codNivelCualificacion?: number;

  @ApiPropertyOptional({ example: 'Nivel 3-4 (C)' })
  @IsOptional() @IsString()
  nivelCualificacion?: string;

  @ApiPropertyOptional({ example: 'Desarrolla aplicaciones web...' })
  @IsOptional() @IsString()
  descripcion?: string;

  // ── Listas (se guardan en `pregunta`, sin tope de ítems) ──
  @ApiPropertyOptional({ type: [String], example: ['Diseñar interfaces', 'Programar APIs'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  funciones?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  denominaciones?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  habilidades?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  conocimientos?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  ocupacionesRelacionadas?: string[];

  @ApiPropertyOptional({ example: 'Trabajo en equipo bajo presión' })
  @IsOptional() @IsString()
  otrasHabilidades?: string;

  @ApiPropertyOptional({ example: 'Normativa de protección de datos' })
  @IsOptional() @IsString()
  otrosConocimientos?: string;
}

/** Cuerpo de `PATCH /api/instrumento3/:id`: todo opcional. */
export class UpdateInstrumento3Dto extends PartialType(CreateInstrumento3Dto) {}

/** Forma de respuesta de los endpoints de Instrumento 3. */
export class Instrumento3DetailDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ enum: Instrumento3Estado, example: Instrumento3Estado.BORRADOR })
  estado: Instrumento3Estado;

  @ApiPropertyOptional({ nullable: true }) fecha?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Usuario que registró la propuesta' })
  analista?: string | null;

  @ApiPropertyOptional({ nullable: true }) nombreApellidos?: string | null;
  @ApiPropertyOptional({ nullable: true }) email?: string | null;
  @ApiPropertyOptional({ nullable: true }) telefono?: string | null;
  @ApiPropertyOptional({ nullable: true }) departamento?: string | null;
  @ApiPropertyOptional({ nullable: true }) municipio?: string | null;
  @ApiPropertyOptional({ nullable: true }) empresaEntidad?: string | null;
  @ApiPropertyOptional({ nullable: true }) cargo?: string | null;
  @ApiPropertyOptional({ nullable: true }) profesion?: string | null;
  @ApiPropertyOptional({ nullable: true }) sector?: string | null;

  @ApiProperty({ example: 'Técnico en Desarrollo Web Full Stack' })
  nombreOcupacion: string;

  @ApiPropertyOptional({ nullable: true }) codOcupacionCNO?: string | null;
  @ApiPropertyOptional({ nullable: true }) codOcupacionCUOC?: string | null;
  @ApiPropertyOptional({ nullable: true }) codArea?: number | null;
  @ApiPropertyOptional({ nullable: true }) areaDesempeno?: string | null;
  @ApiPropertyOptional({ nullable: true }) codNivelCualificacion?: number | null;
  @ApiPropertyOptional({ nullable: true }) nivelCualificacion?: string | null;
  @ApiPropertyOptional({ nullable: true }) descripcion?: string | null;
  @ApiPropertyOptional({ nullable: true }) otrasHabilidades?: string | null;
  @ApiPropertyOptional({ nullable: true }) otrosConocimientos?: string | null;

  @ApiProperty({ type: [String] }) funciones: string[];
  @ApiProperty({ type: [String] }) denominaciones: string[];
  @ApiProperty({ type: [String] }) habilidades: string[];
  @ApiProperty({ type: [String] }) conocimientos: string[];
  @ApiProperty({ type: [String] }) ocupacionesRelacionadas: string[];

  @ApiPropertyOptional({
    type: () => [PreguntaSnapshotDto],
    description: 'Snapshot plano que consume Validación Experta',
  })
  preguntas?: PreguntaSnapshotDto[];
}
