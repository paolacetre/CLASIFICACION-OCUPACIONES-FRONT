import { PartialType } from '@nestjs/swagger';
import { CreateCuocOcupacionDto } from './create-cuoc-ocupacion.dto';

/**
 * DTO para actualización parcial de una ocupación CUOC.
 * Todos los campos son opcionales (hereda de CreateCuocOcupacionDto con PartialType).
 */
export class UpdateCuocOcupacionDto extends PartialType(CreateCuocOcupacionDto) {}
