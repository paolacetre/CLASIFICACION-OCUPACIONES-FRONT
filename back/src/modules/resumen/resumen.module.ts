import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { PreguntaRespuesta } from '../encuesta/entities/pregunta-respuesta.entity';
import { Instrumento3Propuesta } from '../instrumento3/entities/instrumento3-propuesta.entity';
import { ResumenController } from './resumen.controller';
import { ResumenService } from './resumen.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Instrumento, Pregunta, Respuesta, PreguntaRespuesta, Instrumento3Propuesta]),
  ],
  controllers: [ResumenController],
  providers: [ResumenService],
})
export class ResumenModule {}
