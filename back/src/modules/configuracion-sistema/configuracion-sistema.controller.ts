import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Repository } from 'typeorm';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';
import { ConfiguracionSistema } from './configuracion-sistema.entity';

const CLAVE_LOGOS = 'logos';
const DATA_URL_IMAGEN = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/;

export interface Logos {
  sidebar: string | null;
  login: string | null;
  favicon: string | null;
}

const SIN_LOGOS: Logos = { sidebar: null, login: null, favicon: null };

/** null = volver al logo por defecto; campo omitido = no se toca. */
export class LogosDto {
  @ApiPropertyOptional({ nullable: true, description: 'Data URL del logo del menú lateral' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1_500_000)
  @Matches(DATA_URL_IMAGEN, { message: 'El logo debe ser una imagen en data URL.' })
  sidebar?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Data URL del logo de la pantalla de inicio de sesión' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1_500_000)
  @Matches(DATA_URL_IMAGEN, { message: 'El logo debe ser una imagen en data URL.' })
  login?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Data URL del favicon' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1_500_000)
  @Matches(DATA_URL_IMAGEN, { message: 'El logo debe ser una imagen en data URL.' })
  favicon?: string | null;
}

@Injectable()
export class ConfiguracionSistemaService {
  constructor(
    @InjectRepository(ConfiguracionSistema)
    private readonly repo: Repository<ConfiguracionSistema>,
  ) {}

  async logos(): Promise<Logos> {
    const fila = await this.repo.findOne({ where: { clave: CLAVE_LOGOS } });
    return { ...SIN_LOGOS, ...((fila?.valor as Partial<Logos>) ?? {}) };
  }

  async guardarLogos(dto: LogosDto, idUsuario: number): Promise<Logos> {
    const siguiente: Logos = { ...(await this.logos()) };
    for (const clave of Object.keys(SIN_LOGOS) as Array<keyof Logos>) {
      if (dto[clave] !== undefined) siguiente[clave] = dto[clave] ?? null;
    }
    await this.repo.save({ clave: CLAVE_LOGOS, valor: { ...siguiente }, idUsuario });
    return siguiente;
  }
}

/**
 * Los logos se guardaban en el localStorage de quien los subía: solo ese
 * navegador los veía. Ahora son del sistema: los ve todo el mundo, incluida la
 * pantalla de inicio de sesión, por eso la lectura no exige sesión.
 */
@ApiTags('Configuración del sistema')
@Controller('api/configuracion-sistema')
export class ConfiguracionSistemaController {
  constructor(private readonly service: ConfiguracionSistemaService) {}

  @Get('logos')
  @ApiOperation({ summary: 'Logos institucionales vigentes (null = logo por defecto). Público.' })
  logos(): Promise<Logos> {
    return this.service.logos();
  }

  @Put('logos')
  @Auth(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cambia los logos institucionales (solo ADMINISTRADOR)' })
  guardarLogos(@Body() dto: LogosDto, @CurrentUser() user: AuthenticatedUser): Promise<Logos> {
    return this.service.guardarLogos(dto, user.idUsuario);
  }
}
