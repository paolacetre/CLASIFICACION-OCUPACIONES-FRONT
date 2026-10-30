import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionSnapshotDto {
  @ApiPropertyOptional({
    example: 'F-0112.01',
    description: 'Código de la función. En las respuestas va normalizado: F-<ocupación real>.<secuencia>',
  })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional({
    example: 'F-573',
    description:
      'Código tal como vive en BD (solo en respuestas). Es el que se debe reenviar al editar: el ' +
      'normalizado es de presentación y no identifica el registro.',
  })
  @IsOptional()
  @IsString()
  codigoInterno?: string;

  @ApiPropertyOptional({ example: 'Coordinar el equipo', description: 'Descripción de la función' })
  @IsOptional()
  @IsString()
  descripcion?: string;
  @ApiPropertyOptional({
    example: 'Inactivo',
    description:
      'Activo | Inactivo (también 1/0 o true/false). Sin valor = activo. Viaja desde Análisis hasta ' +
      'la copia y Validación experta para que una función o denominación dada de baja no reviva al guardar.',
  })
  @IsOptional()
  @IsString()
  estado?: string;
}

export class NombreSnapshotDto {
  @ApiPropertyOptional({
    example: 'D-0112.001',
    description: 'Código del ítem. Las denominaciones van normalizadas: D-<ocupación real>.<secuencia>',
  })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional({
    example: '0112-14-1-D1',
    description: 'Código tal como vive en BD (solo en respuestas); es el que se reenvía al editar.',
  })
  @IsOptional()
  @IsString()
  codigoInterno?: string;

  @ApiPropertyOptional({ example: 'Técnico en sistemas', description: 'Nombre del ítem' })
  @IsOptional()
  @IsString()
  nombre?: string;
  @ApiPropertyOptional({
    example: 'Inactivo',
    description:
      'Activo | Inactivo (también 1/0 o true/false). Sin valor = activo. Viaja desde Análisis hasta ' +
      'la copia y Validación experta para que una función o denominación dada de baja no reviva al guardar.',
  })
  @IsOptional()
  @IsString()
  estado?: string;
}
