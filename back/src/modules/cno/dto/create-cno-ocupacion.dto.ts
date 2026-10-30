import { Type } from 'class-transformer';
import {
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
  IsOptional,
  IsInt,
  IsNotEmpty,
  ArrayMinSize,
  ValidateNested,
  ValidateIf,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Letras (con tildes y ñ), números, espacios y la puntuación habitual. Igual que en el formulario del front. */
const PATRON_TEXTO_OCUPACION = /^[\p{L}\p{N}\s.,;:()\-/'"&ºª°]+$/u;

export class CreateCnoRegDenominacionChildDto {
  @ApiProperty({ example: 'Administrador de sistemas', description: 'Descripción de la denominación. El código (D-{codOcupacion}.NNN) se genera automáticamente en el backend.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Cada denominación admite máximo 200 caracteres.' })
  @Matches(PATRON_TEXTO_OCUPACION, { message: 'Una denominación contiene caracteres no permitidos.' })
  descDenominacion: string;

  @ApiPropertyOptional({ example: 1, description: 'Estado (1=activo, 0=inactivo)' })
  @IsOptional()
  @IsInt()
  estado?: number;
}

export class CreateCnoRegFuncionesChildDto {
  @ApiPropertyOptional({ example: 'F-001', description: 'Código de una función existente en el catálogo cno_funcion. Si se omite, se crea una función nueva a partir de descFuncionCno.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  codFuncion?: string;

  @ApiPropertyOptional({ example: 'Coordinar el equipo de trabajo', description: 'Descripción de la función. Obligatoria cuando no se envía codFuncion (crea una función nueva en el catálogo); opcional como descripción específica cuando se referencia una función existente.' })
  @ValidateIf((o: CreateCnoRegFuncionesChildDto) => !o.codFuncion)
  @IsString()
  @IsNotEmpty({ message: 'descFuncionCno es obligatorio para crear una función nueva cuando no se envía codFuncion.' })
  descFuncionCno?: string;

  @ApiPropertyOptional({ example: 1, description: 'Estado de la relación ocupación-función' })
  @IsOptional()
  @IsInt()
  estado?: number;
}

export class CreateCnoRegHabilidadChildDto {
  @ApiProperty({ example: 10, description: 'Código numérico de una habilidad/destreza existente en el catálogo' })
  @IsInt()
  codHabilidad: number;
}

export class CreateCnoRegConocimientoChildDto {
  @ApiProperty({ example: 5, description: 'Código numérico de un conocimiento existente en el catálogo cno_conocimiento' })
  @IsInt()
  codConocimiento: number;
}

export class CreateCnoRelacionadaChildDto {
  @ApiPropertyOptional({ example: 'Analista de datos', description: 'Nombre de la ocupación CNO relacionada' })
  @IsOptional()
  @IsString()
  nombreOcupacion?: string;

  @ApiPropertyOptional({ example: '2120', description: 'Código de la ocupación CNO relacionada' })
  @IsOptional()
  @IsString()
  codigoOcupacion?: string;

  @ApiPropertyOptional({ example: 'Científico de datos', description: 'Nombre de la ocupación CNO vinculada' })
  @IsOptional()
  @IsString()
  nombreCnoRelacionada?: string;
}

export class CreateCnoOcupacionDto {
  @ApiProperty({ example: '2111', description: 'Código único de la ocupación CNO (4 dígitos numéricos)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'El código de la ocupación CNO debe tener exactamente 4 dígitos numéricos.' })
  codOcupacionCno: string;

  @ApiProperty({ example: 'Físicos y astrónomos', description: 'Nombre de la ocupación CNO (3 a 200 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El nombre de la ocupación debe tener al menos 3 caracteres.' })
  @MaxLength(200, { message: 'El nombre de la ocupación admite máximo 200 caracteres.' })
  @Matches(PATRON_TEXTO_OCUPACION, { message: 'El nombre de la ocupación contiene caracteres no permitidos.' })
  nombOcupacionCno: string;

  @ApiProperty({ example: 'Investigan y aplican conceptos físicos...', description: 'Descripción de la ocupación (máx. 1000 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'La descripción admite máximo 1000 caracteres.' })
  descripcion: string;

  @ApiProperty({ example: true, description: 'Estado activo/inactivo de la ocupación' })
  @IsBoolean()
  estado: boolean;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Fecha de inactivación (ISO 8601). Obligatoria solo si estado=false' })
  @ValidateIf((o: CreateCnoOcupacionDto) => o.estado === false)
  @IsDateString()
  fechaInactivacion?: string;

  @ApiProperty({ example: '2023-01-15', description: 'Fecha de registro (ISO 8601)' })
  @IsDateString()
  fechaRegistro: string;

  @ApiProperty({ example: 'Usuario SENA', description: 'Trazabilidad del registro (máx. 150 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150, { message: 'La trazabilidad admite máximo 150 caracteres.' })
  trazabilidad: string;

  @ApiProperty({ example: 'A', description: 'Código del área de desempeño' })
  @IsString()
  @IsNotEmpty()
  codDesempeno: string;

  @ApiPropertyOptional({ example: 'Ciencias Naturales y Aplicadas', description: 'Nombre del área de desempeño (informativo, se recalcula desde codDesempeno)' })
  @IsOptional()
  @IsString()
  nomDesempeno?: string;

  @ApiProperty({ example: 'NC6', description: 'Código del nivel de cualificación' })
  @IsString()
  @IsNotEmpty()
  codCualificacion: string;

  @ApiPropertyOptional({ example: 'Nivel 6', description: 'Descripción del nivel de cualificación (informativo, se recalcula desde codCualificacion)' })
  @IsOptional()
  @IsString()
  nivelesCualificacion?: string;

  @ApiProperty({ type: () => [CreateCnoRegDenominacionChildDto], description: 'Denominaciones asociadas a la ocupación (mínimo 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCnoRegDenominacionChildDto)
  denominaciones: CreateCnoRegDenominacionChildDto[];

  @ApiProperty({ type: () => [CreateCnoRegFuncionesChildDto], description: 'Funciones asociadas a la ocupación (mínimo 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCnoRegFuncionesChildDto)
  funciones: CreateCnoRegFuncionesChildDto[];

  @ApiProperty({ type: () => [CreateCnoRegHabilidadChildDto], description: 'Habilidades/destrezas asociadas (mínimo 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCnoRegHabilidadChildDto)
  habilidades: CreateCnoRegHabilidadChildDto[];

  @ApiProperty({ type: () => [CreateCnoRegConocimientoChildDto], description: 'Conocimientos asociados (mínimo 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCnoRegConocimientoChildDto)
  conocimientos: CreateCnoRegConocimientoChildDto[];

  @ApiPropertyOptional({ type: () => [CreateCnoRelacionadaChildDto], description: 'Ocupaciones CNO relacionadas (opcional)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCnoRelacionadaChildDto)
  relacionadas?: CreateCnoRelacionadaChildDto[];
}
