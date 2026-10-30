import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, of, switchMap, tap, throwError } from 'rxjs';
import { CACHE_CATALOGO, OpcionesCacheCatalogo } from './cache-catalogo.decorator';
import { RedisCacheService } from './redis-cache.service';

const VERBOS_MUTACION = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Mutaciones que no tocan el catálogo (o no escriben nada aunque viajen por
 * POST). Todo lo demás invalida: igual que la bitácora, un endpoint nuevo nace
 * invalidando en vez de depender de que alguien se acuerde. Hay que ser
 * generoso porque el catálogo se escribe también desde Análisis e
 * Instrumentos (copias de ocupaciones), no solo desde /api/cno y /api/cuoc.
 * Un falso positivo solo cuesta un fallo de caché; un falso negativo sirve
 * datos viejos.
 */
const MUTACIONES_SIN_EFECTO: RegExp[] = [
  /^auth\b/,
  /^usuario\b/,
  /^api\/bitacora\b/,
  /^api\/mi-cuenta\b/,
  /^api\/configuracion-sistema\b/,
  /^api\/(public\/)?solicitudes-ocupacion\b/,
  /\/validar$/,
  /\/buscar$/,
];

/**
 * Global. Dos trabajos:
 *  - GET de un handler marcado con @CacheCatalogo: responde desde Redis si
 *    está (cabecera `X-Cache: HIT`) o deja pasar y guarda el resultado (`MISS`).
 *  - Mutación exitosa: sube la versión del catálogo ANTES de responder, para
 *    que la siguiente lectura del mismo cliente ya no vea datos viejos.
 */
@Injectable()
export class CatalogoCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: RedisCacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const metodo = req.method?.toUpperCase() ?? 'GET';
    const ruta = (req.originalUrl ?? req.url ?? '').replace(/^\//, '');

    if (VERBOS_MUTACION.has(metodo)) {
      const rutaSinQuery = ruta.split('?')[0];
      if (MUTACIONES_SIN_EFECTO.some((re) => re.test(rutaSinQuery))) return next.handle();
      // También si falla: una carga masiva puede confirmar varias hojas y
      // luego lanzar; la BD ya cambió aunque la respuesta sea un error.
      return next.handle().pipe(
        mergeMap(async (cuerpo) => {
          await this.cache.invalidarCatalogo();
          return cuerpo;
        }),
        catchError((err) => from(this.cache.invalidarCatalogo()).pipe(switchMap(() => throwError(() => err)))),
      );
    }

    if (metodo !== 'GET') return next.handle();

    const opciones = this.reflector.getAllAndOverride<OpcionesCacheCatalogo | false | undefined>(CACHE_CATALOGO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opciones || !this.cache.disponible) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const ttl = opciones.ttl ?? this.cache.ttlPorDefecto;

    return from(this.cache.versionCatalogo()).pipe(
      switchMap((version) => {
        if (version === null) return next.handle();
        const clave = `cat:${version}:${normalizarRuta(ruta)}`;

        return from(this.cache.getJson<unknown>(clave)).pipe(
          switchMap((cacheado) => {
            if (cacheado !== undefined) {
              res.setHeader('X-Cache', 'HIT');
              return of(cacheado);
            }
            res.setHeader('X-Cache', 'MISS');
            return next.handle().pipe(tap((cuerpo) => void this.cache.setJson(clave, cuerpo, ttl)));
          }),
        );
      }),
    );
  }
}

/** Misma consulta con los parámetros en otro orden = misma clave. */
function normalizarRuta(ruta: string): string {
  const [camino, query = ''] = ruta.split('?');
  const params = new URLSearchParams(query);
  params.sort();
  const ordenados = params.toString();
  return ordenados ? `${camino}?${ordenados}` : camino;
}
