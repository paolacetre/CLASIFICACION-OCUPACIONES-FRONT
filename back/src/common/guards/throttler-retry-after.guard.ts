import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * ThrottlerGuard que además envía la cabecera estándar `Retry-After`.
 *
 * Con varios límites con nombre, @nestjs/throttler la envía con sufijo
 * (`Retry-After-apiKey`), que ningún cliente HTTP reconoce: el sistema externo
 * no sabría cuánto esperar y reintentaría de inmediato, alargando su bloqueo.
 */
@Injectable()
export class ThrottlerRetryAfterGuard extends ThrottlerGuard {
  protected async throwThrottlingException(context: ExecutionContext, detalle: ThrottlerLimitDetail): Promise<void> {
    const segundos = Math.max(1, Math.ceil(detalle.timeToBlockExpire || detalle.timeToExpire || 1));
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(segundos));
    return super.throwThrottlingException(context, detalle);
  }
}
