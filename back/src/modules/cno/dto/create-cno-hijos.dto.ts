import { IsInt, IsString, IsOptional } from 'class-validator';

export class CreateCnoRegDenominacionDto {
  @IsString()
  codDenominacionCno: string;

  @IsOptional()
  @IsString()
  descDenominacion?: string;

  @IsOptional()
  @IsInt()
  estado?: number;

  @IsString()
  codOcupacionCno: string;
}

export class CreateCnoRegFuncionesDto {
  @IsString()
  codFuncion: string;

  @IsOptional()
  @IsString()
  descFuncionCno?: string;

  @IsOptional()
  @IsInt()
  estado?: number;

  @IsString()
  codOcupacionCno: string;
}

export class CreateCnoRegHabilidadDto {
  @IsInt()
  codHabilidad: number;

  @IsString()
  codOcupacionCno: string;
}

export class CreateCnoRelacionadaDto {
  @IsOptional()
  @IsString()
  nombreOcupacion?: string;

  @IsOptional()
  @IsString()
  codigoOcupacion?: string;

  @IsOptional()
  @IsString()
  nombreCnoRelacionada?: string;

  @IsString()
  codOcupacionCno: string;
}
