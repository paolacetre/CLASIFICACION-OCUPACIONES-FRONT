import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString } from 'class-validator';

import { EnviarExpertoDto } from '../../validacion-experta/dto/validacion-experta.dto';

/**
 * Mínimo y máximo de ocupaciones que se pueden enviar juntas a validación. Un
 * instrumento trae como mucho 3 (entre CNO y CUOC): el máximo es una defensa
 * de la API, la pantalla nunca ofrece más.
 */
export const MIN_OCUPACIONES_ENVIO = 1;
export const MAX_OCUPACIONES_ENVIO = 3;

/**
 * Envío de Instrumento 2: además de los expertos, quien envía elige qué
 * ocupaciones del instrumento van a validación (de 1 a 3).
 */
export class EnviarExpertoInstrumento2Dto extends EnviarExpertoDto {
  @ApiProperty({
    type: [String],
    example: ['5113-9-1', '01100-9-3'],
    description: 'Códigos de la COPIA de las ocupaciones del instrumento que se envían a validar',
  })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((c) => (typeof c === 'string' ? c.trim() : c)) : value,
  )
  @IsArray({ message: 'Selecciona las ocupaciones que se enviarán a validar.' })
  @ArrayMinSize(MIN_OCUPACIONES_ENVIO, { message: 'Selecciona al menos una ocupación para enviar.' })
  @ArrayMaxSize(MAX_OCUPACIONES_ENVIO, {
    message: `Puedes enviar como máximo ${MAX_OCUPACIONES_ENVIO} ocupaciones.`,
  })
  @ArrayUnique({ message: 'Hay ocupaciones repetidas en la selección.' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ocupaciones: string[];
}
