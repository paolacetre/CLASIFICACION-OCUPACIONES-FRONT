import { IsOptional, IsString, IsIn, IsEmail, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUsuarioDto {
  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Nombre y apellido del usuario, en un solo campo' })
  @IsOptional()
  @IsString()
  nombreApellido?: string;

  @ApiPropertyOptional({ example: 'juan.perez@example.com', description: 'Correo electrónico del usuario' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  correo?: string;

  // El usuario de acceso no se edita: se recalcula con el correo (si es del
  // SENA) o con la cédula cada vez que cambia alguno de los dos.
  @ApiPropertyOptional({
    example: '1193847562',
    description: 'Cédula (5 a 12 dígitos). Vacía la quita, salvo que sea el usuario de acceso (correo no SENA).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[\d.\s]*$/, { message: 'La cédula solo puede tener números' })
  documento?: string;

  @ApiPropertyOptional({ example: '3001234567', description: 'Número de teléfono o contacto' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({
    example: 'ANALISTA',
    description: 'Nuevo rol asignado al usuario: ADMINISTRADOR, ANALISTA, EXPERTO, CIUDADANO o APE (también acepta las claves cortas admin/analyst/expert/citizen/ape)',
  })
  @IsOptional()
  @IsString()
  rol?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'], description: 'Nuevo estado del usuario' })
  @IsOptional()
  @IsIn(['active', 'inactive'], { message: 'El estado debe ser "active" o "inactive"' })
  estado?: string;
}
