import { Module } from '@nestjs/common';
import { CnoModule } from '../cno/cno.module';
import { SeedService } from './seed.service';
import { SiembraCnoService } from './siembra-cno.service';

/**
 * Siembras automáticas en el arranque:
 * - SeedService: cuentas de prueba (ver por qué vive en la app y no en SQL).
 * - SiembraCnoService: catálogo CNO desde database/siembra/cno.xlsx, una vez por versión del libro.
 */
@Module({
  imports: [CnoModule],
  providers: [SeedService, SiembraCnoService],
})
export class SeedModule {}
