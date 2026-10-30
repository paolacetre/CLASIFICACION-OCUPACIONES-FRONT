import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HabilidadDestreza, Notificacion } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([HabilidadDestreza, Notificacion])],
  exports: [TypeOrmModule],
})
export class SharedModule {}
