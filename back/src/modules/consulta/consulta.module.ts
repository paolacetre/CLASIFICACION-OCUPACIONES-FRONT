import { Module, forwardRef } from '@nestjs/common';
import { ConsultaController } from './consulta.controller';
import { ConsultaPublicaController } from './consulta-publica.controller';
import { ConsultaService } from './consulta.service';
import { CnoModule } from '../cno/cno.module';
import { CuocModule } from '../cuoc/cuoc.module';
import { CorrelativaModule } from '../correlativa/correlativa.module';

@Module({
  imports: [
    forwardRef(() => CnoModule),
    forwardRef(() => CuocModule),
    CorrelativaModule,
  ],
  controllers: [ConsultaController, ConsultaPublicaController],
  providers: [ConsultaService],
  exports: [ConsultaService],
})
export class ConsultaModule {}
