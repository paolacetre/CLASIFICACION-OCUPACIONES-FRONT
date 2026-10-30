import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Correlativa, CorrelativaConocimiento, CorrelativaOcupacion } from './entities';
import { CorrelativaService } from './services/correlativa.service';
import { CorrelativaCargaService } from './services/correlativa-carga.service';
import { CorrelativaController } from './controllers/correlativa.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Correlativa, CorrelativaConocimiento, CorrelativaOcupacion]),
  ],
  controllers: [CorrelativaController],
  providers: [CorrelativaService, CorrelativaCargaService],
  exports: [TypeOrmModule, CorrelativaService, CorrelativaCargaService],
})
export class CorrelativaModule {}
