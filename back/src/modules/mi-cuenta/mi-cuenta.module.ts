import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../usuario/entities/usuario.entity';
import { UsuarioCuenta } from './entities/usuario-cuenta.entity';
import { MiCuentaController } from './mi-cuenta.controller';
import { MiCuentaService } from './mi-cuenta.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsuarioCuenta, Usuario])],
  controllers: [MiCuentaController],
  providers: [MiCuentaService],
})
export class MiCuentaModule {}
