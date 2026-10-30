import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Instrumento3Propuesta } from './entities/instrumento3-propuesta.entity';
import { Instrumento3Controller } from './instrumento3.controller';
import { Instrumento3Service } from './instrumento3.service';
import { ValidacionExpertaModule } from '../validacion-experta/validacion-experta.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Instrumento, Pregunta, Instrumento3Propuesta]),
    ValidacionExpertaModule,
  ],
  controllers: [Instrumento3Controller],
  providers: [Instrumento3Service],
  exports: [TypeOrmModule],
})
export class Instrumento3Module {}
