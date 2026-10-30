import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCnoFuncionDto {
  @ApiProperty({ example: 'Coordinar el equipo de trabajo', description: 'Nueva descripción de la función' })
  @IsString()
  @IsNotEmpty()
  descFuncionCno: string;
}
