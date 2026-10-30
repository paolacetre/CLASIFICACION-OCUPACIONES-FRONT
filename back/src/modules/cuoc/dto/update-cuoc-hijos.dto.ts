import { PartialType } from '@nestjs/swagger';
import {
  CreateCuocFuncionDto,
  CreateCuocDenominacionDto,
  CreateCuocRegConocimientoDto,
  CreateCuocDestrezaDto,
} from './create-cuoc-hijos.dto';

export class UpdateCuocFuncionDto extends PartialType(CreateCuocFuncionDto) {}
export class UpdateCuocDenominacionDto extends PartialType(CreateCuocDenominacionDto) {}
export class UpdateCuocRegConocimientoDto extends PartialType(CreateCuocRegConocimientoDto) {}
export class UpdateCuocDestrezaDto extends PartialType(CreateCuocDestrezaDto) {}
