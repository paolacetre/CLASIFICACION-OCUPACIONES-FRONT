import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

const aBooleano = ({ value }: { value: unknown }) => value === true || value === 'true';

/** ?incluirCopias=true: suma las copias de Análisis. Por defecto solo el catálogo oficial. */
export class IncluirCopiasDto {
  @ApiPropertyOptional({ description: 'Incluir las copias de niveles creadas para Análisis', default: false })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluirCopias?: boolean;
}

export class ConsultarNivelesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Incluir las copias de niveles creadas para Análisis', default: false })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluirCopias?: boolean;
}

/** Nivel del catálogo OFICIAL (Actualización). */
export class CrearNivelDto {
  @ApiProperty({ example: '7', description: 'Código del nivel: letras o números, sin espacios (máx. 10)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10, { message: 'El código admite máximo 10 caracteres.' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'El código solo admite letras o números, sin espacios.' })
  codigo: string;

  @ApiProperty({ example: 'Nivel 7 - Especialistas', description: 'Nombre del nivel (3 a 150 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El nombre del nivel debe tener al menos 3 caracteres.' })
  @MaxLength(150, { message: 'El nombre del nivel admite máximo 150 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción del nivel (máx. 1000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'La descripción admite máximo 1000 caracteres.' })
  descripcion?: string;
}

/** Copia de nivel para Análisis: el código se asigna solo. */
export class CrearNivelCopiaDto {
  @ApiProperty({ example: 'Nivel 2 (B) - Técnicos', description: 'Nombre del nivel (3 a 150 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El nombre del nivel debe tener al menos 3 caracteres.' })
  @MaxLength(150, { message: 'El nombre del nivel admite máximo 150 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción del nivel (máx. 1000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'La descripción admite máximo 1000 caracteres.' })
  descripcion?: string;

  @ApiPropertyOptional({ example: '2', description: 'Código del nivel OFICIAL del que se crea la copia (vacío si es un nivel nuevo)' })
  @IsOptional()
  @IsString()
  codOriginal?: string;
}

export class ActualizarNivelCopiaDto {
  @ApiPropertyOptional({ description: 'Nombre del nivel (3 a 150 caracteres)' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El nombre del nivel debe tener al menos 3 caracteres.' })
  @MaxLength(150, { message: 'El nombre del nivel admite máximo 150 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Descripción del nivel (máx. 1000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'La descripción admite máximo 1000 caracteres.' })
  descripcion?: string;
}
