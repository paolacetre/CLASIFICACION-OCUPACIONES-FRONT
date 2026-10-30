import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiOkResponse, ApiSecurity } from '@nestjs/swagger';
import { ConsultaService } from './consulta.service';
import { BuscarOcupacionDto } from '../../common/dto/buscar-ocupacion.dto';
import { CacheCatalogo } from '../cache/cache-catalogo.decorator';
import { FichaOcupacionDto, ResultadoBuscadorDto } from '../cno/entities/consulta-publica.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

/**
 * Endpoints de solo lectura del catálogo CNO/CUOC para sistemas externos (el
 * buscador de ocupaciones y los sistemas de APE y Tendencias). No usan
 * usuario ni sesión de este sistema: exigen una API key en `x-api-key`.
 */
@ApiTags('Consulta pública CNO/CUOC')
@ApiSecurity('api-key')
@ApiResponse({ status: 401, description: 'Falta la API key o no es válida' })
@ApiResponse({ status: 429, description: 'Demasiadas peticiones o demasiadas llaves inválidas; ver cabecera Retry-After' })
@UseGuards(ApiKeyGuard)
@CacheCatalogo()
@Controller('api/public/consulta')
export class ConsultaPublicaController {
  constructor(private readonly consultaService: ConsultaService) {}

  @Get('buscar')
  @ApiOperation({ summary: 'Buscador: ocupaciones (CNO y CUOC) por código, nombre o denominación, con sus denominaciones' })
  @ApiOkResponse({ type: [ResultadoBuscadorDto] })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos (limit fuera de 1–50, q de más de 120 caracteres)' })
  buscar(@Query() filtros: BuscarOcupacionDto): Promise<ResultadoBuscadorDto[]> {
    return this.consultaService.buscarPublico(filtros);
  }

  @Get(':codigo')
  @ApiOperation({
    summary: 'Ficha pública de una ocupación por código (CNO o CUOC)',
    description: 'Detecta automáticamente si el código es CNO (4 dígitos) o CUOC (5 dígitos).',
  })
  @ApiParam({ name: 'codigo', example: '0211', description: 'Código de la ocupación (4 dígitos = CNO, 5 dígitos = CUOC)' })
  @ApiOkResponse({ type: FichaOcupacionDto })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  detalle(@Param('codigo') codigo: string): Promise<FichaOcupacionDto> {
    return this.consultaService.fichaPublica(codigo);
  }
}
