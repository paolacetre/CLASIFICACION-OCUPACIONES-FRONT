import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { PreguntaRespuesta } from '../encuesta/entities/pregunta-respuesta.entity';
import { Usuario } from '../usuario/entities/usuario.entity';
import { UsuarioRol } from '../auth/entities/usuario-rol.entity';
import { InstrumentoExperto } from './entities/instrumento-experto.entity';
import { ValidacionExpertaService } from './validacion-experta.service';

/**
 * Validación de los expertos, compartida por Instrumento 2 e Instrumento 3.
 * Vive en `respuestas` + `pregunta_respuesta`, con los expertos asignados en
 * `instrumento_experto`. No expone controlador propio: cada instrumento
 * publica los endpoints bajo su ruta (`/api/instrumentoN/:id/...`) y delega aquí.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Instrumento,
      Pregunta,
      Respuesta,
      PreguntaRespuesta,
      Usuario,
      UsuarioRol,
      InstrumentoExperto,
    ]),
  ],
  providers: [ValidacionExpertaService],
  exports: [ValidacionExpertaService, TypeOrmModule],
})
export class ValidacionExpertaModule {}
