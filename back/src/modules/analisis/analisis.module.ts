import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ComparativaOcupacion } from './entities/comparativa-ocupacion.entity';
import { Instrumento2Module } from '../instrumento2/instrumento2.module';
import { OcupacionCopiaModule } from '../ocupacion-copia/ocupacion-copia.module';

import { AnalisisController } from './analisis.controller';
import { AnalisisService } from './analisis.service';
import { AnalisisOpcionesService } from './analisis-opciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([ComparativaOcupacion]), Instrumento2Module, OcupacionCopiaModule],
  controllers: [AnalisisController],
  providers: [AnalisisService, AnalisisOpcionesService],
})
export class AnalisisModule {}
