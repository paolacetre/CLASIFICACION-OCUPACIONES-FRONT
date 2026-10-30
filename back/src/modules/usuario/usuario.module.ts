import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities';
import { UsuarioController } from './usuario.controller';
import { UsuarioService } from './usuario.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Módulo Usuario — Gestión de usuarios del sistema.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), AuthModule],
  controllers: [UsuarioController],
  providers: [UsuarioService],
  exports: [TypeOrmModule],
})
export class UsuarioModule {}
