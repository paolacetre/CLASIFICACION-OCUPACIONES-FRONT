import { IsInt, IsString, IsOptional, Matches, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCuocFuncionDto {
  @ApiPropertyOptional({ example: 'F-001', description: 'Código de la función CUOC' })
  @IsOptional()
  @IsString()
  codFuncionCuoc?: string;

  @ApiPropertyOptional({ example: 'Coordinar actividades del área', description: 'Nombre de la función CUOC' })
  @IsOptional()
  @IsString()
  nomFuncionCuoc?: string;

  @ApiProperty({ example: '3512', description: 'Código de la ocupación CUOC padre' })
  @IsString()
  codOcupacionCuoc: string;
}

export class CreateCuocDenominacionDto {
  @ApiProperty({ example: 'DEN-001', description: 'Código único de la denominación CUOC' })
  @IsString()
  codDenominacion: string;

  @ApiPropertyOptional({ example: 'Técnico en sistemas', description: 'Nombre de la denominación' })
  @IsOptional()
  @IsString()
  nomDenominacion?: string;

  @ApiPropertyOptional({ example: 'SENA', description: 'Fuente de la denominación' })
  @IsOptional()
  @IsString()
  fuenteDenom?: string;

  @ApiPropertyOptional({ description: 'Observación de la denominación' })
  @IsOptional()
  @IsString()
  observacion?: string;

  @ApiProperty({ example: '3512', description: 'Código de la ocupación CUOC padre' })
  @IsString()
  codOcupacionCuoc: string;
}

export class CreateCuocRegConocimientoDto {
  @ApiProperty({ example: '3512', description: 'Código de la ocupación CUOC padre' })
  @IsString()
  codOcupacionCuoc: string;

  @ApiProperty({ example: 42, description: 'Código numérico del conocimiento' })
  @IsInt()
  codConocimiento: number;
}

export class CreateCuocDestrezaDto {
  @ApiProperty({ example: '3512', description: 'Código de la ocupación CUOC padre' })
  @IsString()
  codOcupacionCuoc: string;

  @ApiProperty({ example: 15, description: 'Código numérico de la habilidad/destreza' })
  @IsInt()
  codHabDest: number;
}

/**
 * «Agregar destreza» de Actualización CUOC, con la estructura de la hoja
 * «Destrezas» de la plantilla oficial: Código de la Ocupación, ID y Nombre de
 * la Destreza (el gran grupo y el nombre de la ocupación solo orientan al
 * usuario: se derivan del código). Vincula la destreza a la ocupación y, si
 * el ID no existe en el catálogo habilidad_destreza, la crea con ese ID.
 */
export class RegistrarDestrezaOcupacionDto {
  @ApiProperty({ example: '21130', description: 'Código de la Ocupación (5 dígitos)' })
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El código de la ocupación debe tener 5 dígitos.' })
  codOcupacionCuoc: string;

  @ApiProperty({ example: 41, description: 'ID de la destreza en habilidad_destreza' })
  @IsInt({ message: 'El ID de la destreza debe ser un número entero.' })
  @Min(1, { message: 'El ID de la destreza debe ser mayor que 0.' })
  codHabDest: number;

  @ApiProperty({ example: 'Pensamiento crítico', description: 'Nombre de la Destreza (obligatorio si el ID es nuevo)' })
  @IsString()
  @MinLength(3, { message: 'El nombre de la destreza debe tener al menos 3 caracteres.' })
  @MaxLength(255, { message: 'El nombre de la destreza admite máximo 255 caracteres.' })
  nombre: string;
}
