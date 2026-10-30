import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Correo o cédula de 5 a 12 dígitos, con o sin espacios alrededor (el servicio
 * los recorta). Misma regla que el formulario (identifierValidator en
 * login.component.ts): el usuario de acceso siempre es uno de los dos
 * (usuarioDeAcceso), así que otro formato no puede corresponder a ninguna cuenta.
 */
const IDENTIFICADOR = /^\s*(?:[^\s@]+@[^\s@]+\.[^\s@]+|\d{5,12})\s*$/;
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'admin@sena.edu.co',
    description: 'Correo SENA o cédula. Con correo de otro dominio se ingresa solo con la cédula.',
  })
  @IsString({ message: 'El identificador debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El correo electrónico o usuario es requerido' })
  @Matches(IDENTIFICADOR, {
    message: 'Ingresa un correo válido (ej. usuario@sena.edu.co) o un número de documento de 5 a 12 dígitos.',
  })
  identifier: string;

  @ApiProperty({ example: 'Sena2026*', description: 'Contraseña del usuario' })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  // 5 y no 6: la contraseña temporal de un usuario importado es su cédula, que
  // puede tener 5 dígitos; con 6 esa persona no podía entrar nunca. Mismo
  // mínimo que el formulario (login.component.ts). Las contraseñas nuevas
  // siguen exigiendo 8 (ChangePasswordDto).
  @MinLength(5, { message: 'La contraseña debe tener al menos 5 caracteres' })
  // Tope de entrada holgado (las nuevas admiten 64): evita procesar textos enormes.
  @MaxLength(128, { message: 'La contraseña admite máximo 128 caracteres' })
  password: string;

  @ApiProperty({
    required: false,
    enum: ['general', 'ape'],
    description: "Formulario desde el que se ingresa. Con 'ape' solo se aceptan usuarios con rol APE.",
  })
  @IsOptional()
  @IsIn(['general', 'ape'], { message: "El portal debe ser 'general' o 'ape'" })
  portal?: 'general' | 'ape';
}

