import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CuocGranGrupo,
  CuocSubgrupoPrincipal,
  CuocSubgrupo,
  CuocGrupoPrimario,
  CuocNivelCompetencia,
  CuocOcupacion,
  CuocDenominacion,
  CuocFuncion,
  CuocAreaCualificacion,
  CuocConocimiento,
  CuocRegConocimiento,
  CuocDestreza,
  CuocOcupacionAfin,
} from './entities';
import {
  CuocOcupacionService,
  CuocHijosService,
  CuocBulkUploadService,
  CuocCargaValidacionService,
} from './services';
import {
  CuocOcupacionController,
  CuocFuncionesController,
  CuocDenominacionesController,
  CuocAreasCualificacionController,
  CuocNivelesCompetenciaController,
  CuocConocimientosController,
  CuocDestrezasController,
  CuocBulkUploadController,
} from './controllers';
import { CuocExportController } from './controllers/cuoc-export.controller';
import { CuocExportService } from './services/cuoc-export.service';
import { CnoModule } from '../cno/cno.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CuocGranGrupo,
      CuocSubgrupoPrincipal,
      CuocSubgrupo,
      CuocGrupoPrimario,
      CuocNivelCompetencia,
      CuocOcupacion,
      CuocDenominacion,
      CuocFuncion,
      CuocAreaCualificacion,
      CuocConocimiento,
      CuocRegConocimiento,
      CuocDestreza,
      CuocOcupacionAfin,
    ]),
    forwardRef(() => CnoModule),
  ],
  controllers: [
    CuocOcupacionController,
    CuocFuncionesController,
    CuocDenominacionesController,
    CuocAreasCualificacionController,
    CuocNivelesCompetenciaController,
    CuocConocimientosController,
    CuocDestrezasController,
    CuocBulkUploadController,
    CuocExportController,
  ],
  providers: [
    CuocOcupacionService,
    CuocHijosService,
    CuocBulkUploadService,
    CuocCargaValidacionService,
    CuocExportService,
  ],
  exports: [TypeOrmModule, CuocOcupacionService, CuocHijosService, CuocBulkUploadService],
})
export class CuocModule {}
