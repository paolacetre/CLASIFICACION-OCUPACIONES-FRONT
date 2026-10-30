import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsNotEmpty,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Letras (con tildes y ñ), números, espacios y la puntuación habitual. Igual que en el formulario del front. */
const PATRON_TEXTO_OCUPACION = /^[\p{L}\p{N}\s.,;:()\-/'"&ºª°]+$/u;

export class CreateCuocFuncionChildDto {
  @ApiPropertyOptional({ example: 'F-001', description: 'Código de la función CUOC' })
  @IsOptional()
  @IsString()
  codFuncionCuoc?: string;

  @ApiPropertyOptional({ example: 'Coordinar actividades del área', description: 'Nombre de la función CUOC' })
  @IsOptional()
  @IsString()
  nomFuncionCuoc?: string;
}

export class CreateCuocDenominacionChildDto {
  @ApiProperty({ example: 'DEN-001', description: 'Código de la denominación CUOC' })
  @IsString()
  codDenominacion: string;

  @ApiPropertyOptional({ example: 'Técnico en sistemas', description: 'Nombre de la denominación (máx. 300 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Cada denominación admite máximo 300 caracteres.' })
  @Matches(PATRON_TEXTO_OCUPACION, { message: 'Una denominación contiene caracteres no permitidos.' })
  nomDenominacion?: string;

  @ApiPropertyOptional({ example: 'SENA', description: 'Fuente de la denominación' })
  @IsOptional()
  @IsString()
  fuenteDenom?: string;

  @ApiPropertyOptional({ description: 'Observación de la denominación' })
  @IsOptional()
  @IsString()
  observacion?: string;
}

export class CreateCuocRegConocimientoChildDto {
  @ApiProperty({ example: 42, description: 'Código numérico del conocimiento asociado' })
  @IsInt()
  codConocimiento: number;
}

export class CreateCuocDestrezaChildDto {
  @ApiProperty({ example: 15, description: 'Código numérico de la habilidad/destreza' })
  @IsInt()
  codHabDest: number;
}

export class CreateCuocOcupacionDto {
  @ApiProperty({ example: '35120', description: 'Código único de la ocupación CUOC (5 dígitos)' })
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El código de la ocupación CUOC debe tener exactamente 5 dígitos numéricos.' })
  codOcupacionCuoc: string;

  @ApiPropertyOptional({ example: 'Técnicos en telecomunicaciones', description: 'Nombre de la ocupación CUOC (3 a 300 caracteres)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la ocupación no puede estar vacío.' })
  @MinLength(3, { message: 'El nombre de la ocupación debe tener al menos 3 caracteres.' })
  @MaxLength(300, { message: 'El nombre de la ocupación admite máximo 300 caracteres.' })
  @Matches(PATRON_TEXTO_OCUPACION, { message: 'El nombre de la ocupación contiene caracteres no permitidos.' })
  nomOcupacionCuoc?: string;

  @ApiPropertyOptional({ example: 'Instalan y mantienen equipos...', description: 'Descripción de la ocupación CUOC (máx. 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La descripción admite máximo 2000 caracteres.' })
  descOcupacionCuoc?: string;

  @ApiPropertyOptional({ example: '2023-01-15', description: 'Fecha de registro (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fechaRegistro?: string;

  @ApiPropertyOptional({ example: true, description: 'Estado activo/inactivo de la ocupación' })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Fecha de inactivación (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fechaInactivacion?: string;

  @ApiPropertyOptional({ example: 'Usuario SENA', description: 'Trazabilidad del registro (máx. 150 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'La trazabilidad admite máximo 150 caracteres.' })
  trazabilidad?: string;

  @ApiPropertyOptional({ example: '351', description: 'Código del grupo primario CUOC' })
  @IsOptional()
  @IsString()
  codGrupoPrim?: string;

  @ApiPropertyOptional({ example: 3, description: 'Código del nivel de competencia' })
  @IsOptional()
  @IsInt()
  codNivel?: number;

  @ApiPropertyOptional({ example: 'Nivel Técnico', description: 'Nombre descriptivo del grupo primario' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: 'TIC', description: 'Código del área de cualificación CUOC' })
  @IsOptional()
  @IsString()
  codigoAreaCuoc?: string;

  @ApiPropertyOptional({ example: 'Nivel 3 - Técnico', description: 'Nombre del nivel de competencia' })
  @IsOptional()
  @IsString()
  nombreNivel?: string;

  @ApiPropertyOptional({ type: () => [CreateCuocFuncionChildDto], description: 'Funciones asociadas a la ocupación' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCuocFuncionChildDto)
  funciones?: CreateCuocFuncionChildDto[];

  @ApiPropertyOptional({ type: () => [CreateCuocDenominacionChildDto], description: 'Denominaciones asociadas a la ocupación' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCuocDenominacionChildDto)
  denominaciones?: CreateCuocDenominacionChildDto[];

  @ApiPropertyOptional({ type: () => [CreateCuocRegConocimientoChildDto], description: 'Conocimientos asociados a la ocupación' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCuocRegConocimientoChildDto)
  regConocimientos?: CreateCuocRegConocimientoChildDto[];

  @ApiPropertyOptional({ type: () => [CreateCuocDestrezaChildDto], description: 'Destrezas asociadas a la ocupación' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCuocDestrezaChildDto)
  destrezas?: CreateCuocDestrezaChildDto[];
}
