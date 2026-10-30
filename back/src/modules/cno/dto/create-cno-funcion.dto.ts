import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCnoFuncionDto {
  @ApiProperty({ example: 'Coordinar el equipo de trabajo', description: 'Descripción de la función. El código (F-NNN) se genera automáticamente en el backend.' })
  @IsString()
  @IsNotEmpty()
  descFuncionCno: string;
}
