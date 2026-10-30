import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Injectable,
  Module,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsObject } from 'class-validator';
import { DataSource } from 'typeorm';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../../common/enums/role.enum';

/** Un formulario completo ocupa unos pocos KB; esto deja margen sin volverlo un almacén. */
const MAX_DATOS = 100_000;

export class CrearSolicitudDto {
  @ApiProperty({ enum: ['wizard', 'alterno'], description: 'Formulario de origen' })
  @IsIn(['wizard', 'alterno'])
  tipo: 'wizard' | 'alterno';

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Campos del formulario tal como los diligenció el ciudadano' })
  @IsObject()
  datos: Record<string, unknown>;
}

export interface SolicitudRadicada {
  radicado: string;
  fechaRegistro: string;
}

@Injectable()
export class SolicitudOcupacionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * El radicado sale de la secuencia de la tabla: único y consecutivo. Antes
   * era `SOL-año-` + 4 dígitos aleatorios generados en el navegador, que podían
   * repetirse y no quedaban registrados en ningún lado.
   */
  async radicar(dto: CrearSolicitudDto): Promise<SolicitudRadicada> {
    const json = JSON.stringify(dto.datos);
    if (json.length > MAX_DATOS) {
      throw new BadRequestException('La solicitud supera el tamaño permitido.');
    }
    const correo = typeof dto.datos['email'] === 'string' ? (dto.datos['email'] as string).trim().slice(0, 255) : null;

    const [fila]: Array<{ radicado: string; fecha_registro: Date }> = await this.dataSource.query(
      `INSERT INTO clasificacion.solicitud_ocupacion (id, radicado, tipo, correo, datos)
       SELECT s.n, 'SOL-' || to_char(now(), 'YYYY') || '-' || lpad(s.n::text, 6, '0'), $1, $2, $3::jsonb
       FROM (SELECT nextval(pg_get_serial_sequence('clasificacion.solicitud_ocupacion', 'id')) AS n) s
       RETURNING radicado, fecha_registro`,
      [dto.tipo, correo || null, json],
    );
    return { radicado: fila.radicado, fechaRegistro: new Date(fila.fecha_registro).toISOString() };
  }

  listar(limit: number) {
    return this.dataSource.query(
      `SELECT id, radicado, tipo, correo, estado, datos, fecha_registro AS "fechaRegistro"
       FROM clasificacion.solicitud_ocupacion
       ORDER BY fecha_registro DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
  }
}

/**
 * Formularios públicos de /nueva-ocupacion: los diligencia un ciudadano sin
 * usuario, así que el envío no exige sesión. Va bajo /api/public para que
 * Nginx le aplique el mismo límite por IP que al resto de la API pública.
 */
@ApiTags('Solicitudes de ocupación')
@Controller()
export class SolicitudOcupacionController {
  constructor(private readonly service: SolicitudOcupacionService) {}

  @Post('api/public/solicitudes-ocupacion')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Radica una solicitud de nueva ocupación (público)' })
  @ApiResponse({ status: 201, description: 'Solicitud guardada; devuelve el número de radicado' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes desde la misma IP' })
  radicar(@Body() dto: CrearSolicitudDto): Promise<SolicitudRadicada> {
    return this.service.radicar(dto);
  }

  @Get('api/solicitudes-ocupacion')
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @ApiOperation({ summary: 'Solicitudes radicadas, más recientes primero' })
  listar(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    return this.service.listar(limit);
  }
}

@Module({
  controllers: [SolicitudOcupacionController],
  providers: [SolicitudOcupacionService],
})
export class SolicitudOcupacionModule {}
