import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RedisCacheService } from './redis-cache.service';
import { CatalogoCacheInterceptor } from './catalogo-cache.interceptor';

@Global()
@Module({
  providers: [
    RedisCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CatalogoCacheInterceptor,
    },
  ],
  exports: [RedisCacheService],
})
export class RedisCacheModule {}
