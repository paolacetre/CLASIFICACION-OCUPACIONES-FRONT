import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerRetryAfterGuard } from './common/guards/throttler-retry-after.guard';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { RedisCacheModule } from './modules/cache/redis-cache.module';

import { AppController } from './app.controller';
import { CnoModule } from './modules/cno/cno.module';
import { CuocModule } from './modules/cuoc/cuoc.module';
import { SharedModule } from './modules/shared/shared.module';
import { CorrelativaModule } from './modules/correlativa/correlativa.module';
import { EncuestaModule } from './modules/encuesta/encuesta.module';
import { UsuarioModule } from './modules/usuario/usuario.module';
import { GeografiaModule } from './modules/geografia/geografia.module';
import { AuthModule } from './modules/auth/auth.module';
import { Instrumento2Module } from './modules/instrumento2/instrumento2.module';
import { Instrumento3Module } from './modules/instrumento3/instrumento3.module';
import { ResumenModule } from './modules/resumen/resumen.module';
import { AnalisisModule } from './modules/analisis/analisis.module';
import { ConsultaModule } from './modules/consulta/consulta.module';
import { SeedModule } from './modules/seed/seed.module';
import { BitacoraModule } from './modules/bitacora/bitacora.module';
import { BitacoraInterceptor } from './modules/bitacora/bitacora.interceptor';
import { CampoOcupacionalInterceptor } from './common/interceptors/campo-ocupacional.interceptor';
import { apiKeyDe, resolverApiKey } from './modules/auth/api-key';
import { MiCuentaModule } from './modules/mi-cuenta/mi-cuenta.module';
import { ConfiguracionSistemaModule } from './modules/configuracion-sistema/configuracion-sistema.module';
import { SolicitudOcupacionModule } from './modules/solicitud-ocupacion/solicitud-ocupacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig, jwtConfig, redisConfig], envFilePath: ['.env', '../.env'] }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        errorMessage: 'Demasiadas peticiones. Espere el tiempo indicado en la cabecera Retry-After y reintente.',
        throttlers: [
          {
            // Límite global por IP: generoso para no frenar a los usuarios de la
            // aplicación (cargas masivas, consultas), pero corta abusos.
            name: 'default',
            ttl: 60_000,
            limit: 2000,
          },
          {
            // Límite por API key (sistemas externos). Se cuenta por llave y no
            // por IP: el otro sistema puede salir por varias IP o compartir una.
            // Quien lo supera espera `blockDuration` antes de poder volver.
            name: 'apiKey',
            ttl: 60_000,
            limit: Number(config.get('API_KEY_LIMITE_POR_MINUTO')) || 300,
            blockDuration: 5 * 60_000,
            skipIf: (context) => !apiKeyDe(context.switchToHttp().getRequest()),
            getTracker: (req) => {
              const consumidor = resolverApiKey(apiKeyDe(req));
              return consumidor ? `apikey:${consumidor.nombre}` : `apikey-invalida:${req.ip}`;
            },
          },
        ],
      }),
    }),

    RedisCacheModule,
    SharedModule,
    CnoModule,
    CuocModule,
    CorrelativaModule,
    EncuestaModule,
    UsuarioModule,
    GeografiaModule,
    AuthModule,
    Instrumento2Module,
    Instrumento3Module,
    ResumenModule,
    AnalisisModule,
    ConsultaModule,
    SeedModule,
    BitacoraModule,
    MiCuentaModule,
    ConfiguracionSistemaModule,
    SolicitudOcupacionModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerRetryAfterGuard,
    },
    // Registra en bitácora cualquier mutación exitosa, sin cablear endpoint
    // por endpoint. Va global para que los endpoints nuevos nazcan con
    // trazabilidad en vez de tener que acordarse de añadirla.
    {
      provide: APP_INTERCEPTOR,
      useClass: BitacoraInterceptor,
    },
    // El campo ocupacional solo lo ven los usuarios APE. Va aquí (AppModule) y
    // no en un módulo importado para quedar por fuera del interceptor de caché:
    // Nest aplica primero los APP_INTERCEPTOR de AppModule.
    {
      provide: APP_INTERCEPTOR,
      useClass: CampoOcupacionalInterceptor,
    },
  ],
})
export class AppModule {}
