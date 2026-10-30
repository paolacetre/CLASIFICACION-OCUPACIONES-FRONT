import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrumento } from './entities';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { ValidacionExpertaModule } from '../validacion-experta/validacion-experta.module';
import { CnoModule } from '../cno/cno.module';
import { CuocModule } from '../cuoc/cuoc.module';
import { OcupacionCopiaModule } from '../ocupacion-copia/ocupacion-copia.module';
import { Instrumento2Controller } from './instrumento2.controller';
import { Instrumento2Service } from './instrumento2.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Instrumento, Pregunta]),
    ValidacionExpertaModule,
    CnoModule,
    CuocModule,
    OcupacionCopiaModule,
  ],
  controllers: [Instrumento2Controller],
  providers: [Instrumento2Service],
  exports: [TypeOrmModule],
})
export class Instrumento2Module {}
