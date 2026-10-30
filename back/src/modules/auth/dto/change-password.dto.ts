import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CONTRASENA_MAX, CONTRASENA_MIN } from '../../../common/utils/politica-contrasena';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Sena2026*', description: 'Contraseña actual del usuario autenticado' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  @MaxLength(128, { message: 'La contraseña actual admite máximo 128 caracteres' })
  currentPassword: string;

  /** El resto de la política (tipos de carácter, comunes, datos personales, espacios) la aplica AuthService.changePassword. */
  @ApiProperty({
    example: 'Mi gato duerme 3 horas!',
    minLength: CONTRASENA_MIN,
    maxLength: CONTRASENA_MAX,
    description:
      'Nueva contraseña: 8 a 64 caracteres con mayúscula, minúscula, número y carácter especial, sin claves comunes ni datos personales',
  })
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
  @MinLength(CONTRASENA_MIN, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @MaxLength(CONTRASENA_MAX, { message: 'La nueva contraseña admite máximo 64 caracteres' })
  newPassword: string;
}
