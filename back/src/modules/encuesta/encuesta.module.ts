import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Respuesta, RespuestaCopy1, Pregunta, PreguntaRespuesta } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([Respuesta, RespuestaCopy1, Pregunta, PreguntaRespuesta])],
  controllers: [],
  providers: [],
  exports: [TypeOrmModule],
})
export class EncuestaModule {}
