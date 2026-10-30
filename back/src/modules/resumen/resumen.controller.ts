import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResumenService } from './resumen.service';
import { ResumenRecordDto } from './dto/resumen.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Resumen')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@Controller('api/resumen')
export class ResumenController {
  constructor(private readonly resumenService: ResumenService) {}

  @Get()
  @ApiOperation({
    summary: 'Registros consolidados de los instrumentos que pasaron por validación experta',
  })
  @ApiResponse({ status: 200, type: [ResumenRecordDto] })
  listar(): Promise<ResumenRecordDto[]> {
    return this.resumenService.listar();
  }
}
