import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Ni el usuario de acceso ni la contraseña se envían: el usuario es el correo
 * si es del SENA o, si no, la cédula; la contraseña inicial es siempre la
 * cédula y hay que cambiarla en el primer ingreso.
 */
export class CreateUsuarioDto {
  @ApiProperty({
    example: '1193847562',
    description: 'Cédula (5 a 12 dígitos; se aceptan puntos), obligatoria. Es la contraseña inicial y, si el correo no es @sena.edu.co, también el usuario.',
  })
  @IsString()
  @IsNotEmpty({ message: 'La cédula es requerida' })
  @Matches(/^[\d.\s]*$/, { message: 'La cédula solo puede tener números' })
  documento: string;

  @ApiProperty({
    example: 'ANALISTA',
    description: 'Rol asignado al usuario: ADMINISTRADOR, ANALISTA, EXPERTO, CIUDADANO o APE (también acepta las claves cortas admin/analyst/expert/citizen/ape)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El rol es requerido' })
  rol: string;

  @ApiProperty({ example: 'Valentina Rojas', description: 'Nombre y apellido, en un solo campo' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre y apellido es requerido' })
  nombreApellido: string;

  @IsEmail({}, { message: 'El correo debe ser un correo válido' })
  @IsNotEmpty({ message: 'El correo es requerido' })
  correo: string;

  @ApiProperty({ example: '3001234567', description: 'Teléfono de contacto: 7 a 15 dígitos, obligatorio.' })
  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @Matches(/^\s*\d{7,15}\s*$/, { message: 'El teléfono debe tener entre 7 y 15 dígitos' })
  telefono: string;
}
