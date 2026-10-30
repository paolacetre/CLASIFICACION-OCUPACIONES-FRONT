import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CnoAreaDesempeno,
  CnoConocimiento,
  CnoFuncion,
  CnoNivelCualificacion,
  CnoOcupacion,
  CnoDenominacion,
  CnoRegFunciones,
  CnoRegHabilidad,
  CnoRegConocimiento,
  CnoRelacionada,
} from './entities';
import { HabilidadDestreza } from '../shared/entities/habilidad-destreza.entity';
import { CnoOcupacionController } from './controllers/cno-ocupacion.controller';
import { CnoBulkUploadController } from './controllers/cno-bulk-upload.controller';
import { CnoCatalogosController } from './controllers/cno-catalogos.controller';
import { CnoFuncionesController } from './controllers/cno-funciones.controller';
import { CnoDenominacionesController } from './controllers/cno-denominaciones.controller';
import { CnoExportController } from './controllers/cno-export.controller';
import { CnoOcupacionService } from './services/cno-ocupacion.service';
import { CnoBulkUploadService } from './services/cno-bulk-upload.service';
import { CnoCargaValidacionService } from './services/cno-carga-validacion.service';
import { CnoCatalogosService } from './services/cno-catalogos.service';
import { CnoFuncionesService } from './services/cno-funciones.service';
import { CnoDenominacionesService } from './services/cno-denominaciones.service';
import { CnoExportService } from './services/cno-export.service';
import { CuocModule } from '../cuoc/cuoc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CnoAreaDesempeno,
      CnoConocimiento,
      CnoFuncion,
      CnoNivelCualificacion,
      CnoOcupacion,
      CnoDenominacion,
      CnoRegFunciones,
      CnoRegHabilidad,
      CnoRegConocimiento,
      CnoRelacionada,
      HabilidadDestreza,
    ]),
    forwardRef(() => CuocModule),
  ],
  controllers: [
    CnoOcupacionController,
    CnoBulkUploadController,
    CnoCatalogosController,
    CnoFuncionesController,
    CnoDenominacionesController,
    CnoExportController,
  ],
  providers: [
    CnoOcupacionService,
    CnoBulkUploadService,
    CnoCargaValidacionService,
    CnoCatalogosService,
    CnoFuncionesService,
    CnoDenominacionesService,
    CnoExportService,
  ],
  exports: [TypeOrmModule, CnoBulkUploadService, CnoOcupacionService],
})
export class CnoModule {}
