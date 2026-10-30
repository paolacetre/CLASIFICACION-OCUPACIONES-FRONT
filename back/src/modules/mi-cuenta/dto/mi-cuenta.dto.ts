import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Avatar como data URL de imagen. ~3 MB de texto equivalen a una imagen de ~2 MB. */
const DATA_URL_IMAGEN = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const MAX_AVATAR = 3_000_000;

export class PreferenciasDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { theme: 'dark', language: 'es', sistema: { fontSize: 'normal' } },
    description: 'Objeto libre con las preferencias de interfaz. Se guarda completo (reemplaza al anterior).',
  })
  @IsObject()
  preferencias: Record<string, unknown>;
}

/** Campos omitidos = no se tocan (por ejemplo, cambiar solo el avatar). */
export class ActualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Ana María Pérez Gómez', description: 'Nombre y apellido, en un solo campo' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombreApellido?: string;

  @ApiPropertyOptional({ example: '+57 300 000 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Data URL de la imagen; null la quita, omitirlo la conserva.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_AVATAR, { message: 'La imagen es demasiado grande (máximo 2 MB).' })
  @Matches(DATA_URL_IMAGEN, { message: 'El avatar debe ser una imagen (PNG, JPG, GIF, WEBP o SVG).' })
  avatar?: string | null;
}

/** Campos del informante que precargan Instrumento 3. Todos opcionales y de texto. */
export class PerfilAnalistaDto {
  @IsOptional() @IsString() @MaxLength(20) fecha?: string;
  @IsOptional() @IsString() @MaxLength(200) nombreApellidos?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @IsString() @MaxLength(100) departamento?: string;
  @IsOptional() @IsString() @MaxLength(100) municipio?: string;
  @IsOptional() @IsString() @MaxLength(255) empresaEntidad?: string;
  @IsOptional() @IsString() @MaxLength(255) cargo?: string;
  @IsOptional() @IsString() @MaxLength(255) profesion?: string;
  @IsOptional() @IsString() @MaxLength(255) sector?: string;
}
