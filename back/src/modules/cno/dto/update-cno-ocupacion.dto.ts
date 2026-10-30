import { PartialType } from '@nestjs/swagger';
import { CreateCnoOcupacionDto } from './create-cno-ocupacion.dto';

/**
 * Actualización parcial de una ocupación CNO (todos los campos opcionales).
 * Solo toca los campos propios de la ocupación: denominaciones, funciones,
 * habilidades, conocimientos y relacionadas tienen sus propios endpoints y no
 * se editan desde aquí (mismo alcance que UpdateCuocOcupacionDto).
 */
export class UpdateCnoOcupacionDto extends PartialType(CreateCnoOcupacionDto) {}
