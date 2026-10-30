import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionItemDto {
  @ApiPropertyOptional({ example: 'F001', description: 'Código de la función' })
  @IsString()
  @IsOptional()
  codigo?: string;

  @ApiPropertyOptional({ example: 'Coordinar el equipo', description: 'Descripción de la función' })
  @IsString()
  @IsOptional()
  descripcion?: string;
  @ApiPropertyOptional({
    example: 'Inactivo',
    description:
      'Activo | Inactivo (también 1/0 o true/false). Sin valor = activo. Viaja desde Análisis hasta ' +
      'la copia y Validación experta para que una función o denominación dada de baja no reviva al guardar.',
  })
  @IsOptional()
  @IsString()
  estado?: string;
}

export class NombreItemDto {
  @ApiPropertyOptional({ example: 'DEN-001', description: 'Código del ítem' })
  @IsString()
  @IsOptional()
  codigo?: string;

  @ApiPropertyOptional({ example: 'Técnico en sistemas', description: 'Nombre del ítem' })
  @IsString()
  @IsOptional()
  nombre?: string;
  @ApiPropertyOptional({
    example: 'Inactivo',
    description:
      'Activo | Inactivo (también 1/0 o true/false). Sin valor = activo. Viaja desde Análisis hasta ' +
      'la copia y Validación experta para que una función o denominación dada de baja no reviva al guardar.',
  })
  @IsOptional()
  @IsString()
  estado?: string;
}

export class PanelAnalisisDto {
  @ApiProperty({ example: '2111', description: 'Código de la ocupación (CNO o CUOC)' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({ example: 'Físicos y astrónomos', description: 'Nombre de la ocupación' })
  @IsString()
  @IsOptional()
  nombre?: string;

  @ApiPropertyOptional({ example: 'Investigan conceptos físicos...', description: 'Descripción de la ocupación' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ example: 'Nivel 6', description: 'Nivel de cualificación' })
  @IsString()
  @IsOptional()
  nivelCualificacion?: string;

  @ApiPropertyOptional({ example: 'Ciencias Naturales', description: 'Área de desempeño' })
  @IsString()
  @IsOptional()
  areaDesempeno?: string;

  @ApiPropertyOptional({ example: 'Activo', description: 'Estado de la ocupación' })
  @IsString()
  @IsOptional()
  estado?: string;

  @ApiPropertyOptional({ example: '2023-01-15', description: 'Fecha de registro' })
  @IsString()
  @IsOptional()
  fechaRegistro?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Fecha de inactividad' })
  @IsString()
  @IsOptional()
  fechaInactividad?: string;

  @ApiPropertyOptional({ example: 'Usuario SENA', description: 'Trazabilidad' })
  @IsString()
  @IsOptional()
  trazabilidad?: string;

  @ApiProperty({ type: () => [FuncionItemDto], description: 'Lista de funciones', default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FuncionItemDto)
  funciones: FuncionItemDto[] = [];

  @ApiProperty({ type: () => [NombreItemDto], description: 'Lista de denominaciones', default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreItemDto)
  denominaciones: NombreItemDto[] = [];

  @ApiProperty({ type: () => [NombreItemDto], description: 'Lista de habilidades', default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreItemDto)
  habilidades: NombreItemDto[] = [];

  @ApiProperty({ type: () => [NombreItemDto], description: 'Lista de conocimientos', default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreItemDto)
  conocimientos: NombreItemDto[] = [];

  @ApiProperty({ type: () => [NombreItemDto], description: 'Ocupaciones relacionadas', default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreItemDto)
  ocupacionesRelacionadas: NombreItemDto[] = [];
}

export class GuardarAnalisisDto {
  @ApiPropertyOptional({ type: () => PanelAnalisisDto, nullable: true, description: 'Panel CNO (izquierda)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PanelAnalisisDto)
  cno?: PanelAnalisisDto | null;

  @ApiPropertyOptional({ type: () => PanelAnalisisDto, nullable: true, description: 'Panel CUOC (centro)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PanelAnalisisDto)
  cuoc?: PanelAnalisisDto | null;

  @ApiPropertyOptional({ type: () => PanelAnalisisDto, nullable: true, description: 'Panel de relación (derecha)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PanelAnalisisDto)
  relacion?: PanelAnalisisDto | null;

  @ApiProperty({ enum: ['left', 'center', 'right'], example: 'left', description: 'Panel seleccionado actualmente' })
  @IsIn(['left', 'center', 'right'])
  panelSeleccionado: 'left' | 'center' | 'right';
}
