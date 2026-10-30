import { Module } from '@nestjs/common';
import { OcupacionCopiaService } from './ocupacion-copia.service';

/**
 * Módulo liviano sin imports propios: `OcupacionCopiaService` no inyecta
 * repositorios (opera vía el `QueryRunner` que le pasa cada llamador), así
 * que no necesita `TypeOrmModule.forFeature`. Existe como módulo aparte
 * (en vez de vivir dentro de `analisis` o `instrumento2`) para que ambos
 * puedan importarlo sin crear una dependencia circular entre ellos.
 */
@Module({
  providers: [OcupacionCopiaService],
  exports: [OcupacionCopiaService],
})
export class OcupacionCopiaModule {}
