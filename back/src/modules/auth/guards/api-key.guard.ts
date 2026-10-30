import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { apiKeyDe, CABECERA_API_KEY, limpiarFallos, registrarFallo, resolverApiKey, verificarBloqueo } from '../api-key';

/**
 * Exige una API key válida (cualquier consumidor) en la cabecera `x-api-key`.
 * Protege la API de consulta que usan los sistemas externos: sin llave no hay datos.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { apiKeyConsumidor?: string }>();
    const ip = req.ip ?? 'desconocida';
    verificarBloqueo(ip, context.switchToHttp().getResponse<Response>());

    const valor = apiKeyDe(req);
    if (!valor) {
      throw new UnauthorizedException(`Falta la API key. Envíela en la cabecera '${CABECERA_API_KEY}'.`);
    }
    const consumidor = resolverApiKey(valor);
    if (!consumidor) {
      registrarFallo(ip);
      throw new UnauthorizedException('API key inválida.');
    }

    limpiarFallos(ip);
    req.apiKeyConsumidor = consumidor.nombre;
    return true;
  }
}
