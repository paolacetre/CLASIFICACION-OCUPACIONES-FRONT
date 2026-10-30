import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionSistema } from './configuracion-sistema.entity';
import { ConfiguracionSistemaController, ConfiguracionSistemaService } from './configuracion-sistema.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionSistema])],
  controllers: [ConfiguracionSistemaController],
  providers: [ConfiguracionSistemaService],
})
export class ConfiguracionSistemaModule {}
