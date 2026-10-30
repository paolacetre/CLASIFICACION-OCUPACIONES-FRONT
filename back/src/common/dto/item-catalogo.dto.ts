import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Ítem de un catálogo simple (área, habilidad/destreza, conocimiento) en
 * Actualización: siempre se guarda en el catálogo OFICIAL.
 */
export class CrearItemCatalogoDto {
  @ApiPropertyOptional({
    example: '10',
    description: 'Código (letras o números, máx. 10). Solo en las áreas; en habilidades y conocimientos se asigna solo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'El código admite máximo 10 caracteres.' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'El código solo admite letras o números, sin espacios.' })
  codigo?: string;

  @ApiProperty({ example: 'Gestión documental', description: 'Nombre (3 a 255 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(255, { message: 'El nombre admite máximo 255 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción (máx. 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La descripción admite máximo 2000 caracteres.' })
  descripcion?: string;
}

export class ActualizarItemCatalogoDto {
  @ApiPropertyOptional({ description: 'Nombre (3 a 255 caracteres)' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(255, { message: 'El nombre admite máximo 255 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Descripción (máx. 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La descripción admite máximo 2000 caracteres.' })
  descripcion?: string;
}
