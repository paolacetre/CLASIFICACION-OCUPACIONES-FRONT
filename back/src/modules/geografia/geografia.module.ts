import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sector } from './entities';

/**
 * Módulo Geografía — Sectores económicos de Colombia.
 * Departamentos y municipios no viven en la BD: salen del catálogo del
 * frontend y se guardan como texto (ver migración 025).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Sector])],
  controllers: [],
  providers: [],
  exports: [TypeOrmModule],
})
export class GeografiaModule {}
