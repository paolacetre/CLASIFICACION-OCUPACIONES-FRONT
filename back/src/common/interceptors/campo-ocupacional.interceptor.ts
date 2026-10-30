import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../../modules/auth/interfaces/jwt-payload.interface';

/** Propiedad con que viaja el campo ocupacional CNO (cno_ocupacion.campo_ocup_cno) en las respuestas. */
export const CAMPO_OCUPACIONAL = 'campoOcupCno';

/** Su descripción (cno_ocupacion.desc_campo_ocup_cno): mismo dato, misma restricción. */
export const DESC_CAMPO_OCUPACIONAL = 'descCampoOcupCno';

const PROPIEDADES_SOLO_APE = new Set([CAMPO_OCUPACIONAL, DESC_CAMPO_OCUPACIONAL]);

/** Regla de negocio: el campo ocupacional solo lo ven los usuarios de la APE. */
export function veCampoOcupacional(user: AuthenticatedUser | undefined): boolean {
  return user?.rol === Role.APE;
}

/**
 * Quita `campoOcupCno` y `descCampoOcupCno` de cualquier respuesta JSON para quien no sea APE.
 *
 * Se hace aquí, en un solo sitio y en el backend, y no ocultándolo en cada
 * pantalla: ocultarlo en el frontend dejaba el dato igual en la respuesta de
 * la API, a la vista de cualquiera con las herramientas del navegador, y cada
 * endpoint nuevo que devolviera la ocupación lo habría filtrado sin querer.
 *
 * Se registra en AppModule para quedar POR FUERA del interceptor de caché de
 * Redis: la caché guarda la respuesta completa (una sola copia para todos los
 * roles) y el recorte se aplica después, según quién pide.
 */
@Injectable()
export class CampoOcupacionalInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (veCampoOcupacional(user)) return next.handle();
    return next.handle().pipe(map((cuerpo) => sinCampoOcupacional(cuerpo)));
  }
}

/** Copia sin esas propiedades, a cualquier profundidad. No muta el original (puede estar en uso por la caché). */
function sinCampoOcupacional(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinCampoOcupacional);
  if (
    valor === null ||
    typeof valor !== 'object' ||
    valor instanceof Date ||
    valor instanceof StreamableFile ||
    Buffer.isBuffer(valor)
  ) {
    return valor;
  }
  const copia: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor)) {
    if (!PROPIEDADES_SOLO_APE.has(clave)) copia[clave] = sinCampoOcupacional(v);
  }
  return copia;
}
