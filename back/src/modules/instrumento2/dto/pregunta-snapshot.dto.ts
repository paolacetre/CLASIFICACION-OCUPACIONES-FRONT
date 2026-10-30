import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Ítem del snapshot plano guardado en `pregunta` al Guardar / Enviar a experto.
 * Es lo que el experto debe validar: el contenido real de ESE instrumento, no
 * una lista de criterios genérica.
 */
export class PreguntaSnapshotDto {
  @ApiProperty({ example: 87 })
  id: number;

  @ApiProperty({
    example: 'funcion',
    description:
      'Campo del instrumento: nombre | descripcion | nivel_cualificacion | area_desempeno | ' +
      'fecha_registro | fecha_inactividad | trazabilidad | observacion | funcion | denominacion | ' +
      'habilidad | conocimiento | relacionada',
  })
  identificador: string;

  @ApiProperty({ example: 'Coordinar el equipo de trabajo', description: 'Valor a validar' })
  detalle: string;

  @ApiPropertyOptional({ nullable: true, example: 'F-0112.01', description: 'Código del ítem, si aplica' })
  codigo?: string | null;

  @ApiPropertyOptional({
    example: '0112-14-1',
    description:
      'Copia de ocupación a la que pertenece el ítem (Instrumento 2, que agrupa hasta 3 ocupaciones; ' +
      'los snapshots anteriores a la migración 028 se atribuyen a la principal). Instrumento 3 no lo usa.',
  })
  codOcupacion?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'TRUE si la función o denominación estaba inactiva en la copia al congelar el snapshot. ' +
      'El experto la ve marcada. Falso en los demás campos y en snapshots anteriores a la migración 034.',
  })
  inactivo?: boolean;
}
