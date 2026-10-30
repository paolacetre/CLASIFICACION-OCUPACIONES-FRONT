import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { BitacoraService } from './bitacora.service';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Registra en la bitácora CUALQUIER cambio que haga un usuario autenticado.
 *
 * Va como interceptor global y no cableado endpoint por endpoint a propósito:
 * hacerlo a mano significaba tocar ~40 controladores, olvidar la mitad, y que
 * cada endpoint nuevo naciera sin trazabilidad. Aquí cualquier mutación queda
 * registrada por el solo hecho de existir.
 *
 * Solo se registra si la petición terminó BIEN: `tap` no corre cuando el
 * handler lanza, así que un 400/404/500 no deja rastro de un cambio que nunca
 * ocurrió.
 */

const VERBOS_MUTACION = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Lo que no es un cambio (aunque viaje por POST) o no vale la pena registrar:
 * login y cambio de contraseña, la propia bitácora, los reportes de solo
 * lectura, y las búsquedas que usan POST para mandar filtros en el body.
 */
const RUTAS_EXCLUIDAS: RegExp[] = [/^auth\b/, /^api\/bitacora\b/, /^api\/resumen\b/, /\/buscar$/];

/** Prefijo de ruta → categoría y nombre legible. Se evalúa del más específico al más general. */
const MODULOS: Array<{ prefijo: string; tipo: string; entidad: string }> = [
  { prefijo: 'api/cno/ocupaciones', tipo: 'cno', entidad: 'la ocupación CNO' },
  { prefijo: 'api/cno/denominaciones', tipo: 'cno', entidad: 'la denominación CNO' },
  { prefijo: 'api/cno/funciones', tipo: 'cno', entidad: 'la función CNO' },
  { prefijo: 'api/cno/catalogos', tipo: 'cno', entidad: 'el catálogo CNO' },
  { prefijo: 'api/cno', tipo: 'cno', entidad: 'el catálogo CNO' },
  { prefijo: 'api/cuoc/ocupaciones', tipo: 'cuoc', entidad: 'la ocupación CUOC' },
  { prefijo: 'api/cuoc/denominaciones', tipo: 'cuoc', entidad: 'la denominación CUOC' },
  { prefijo: 'api/cuoc/funciones', tipo: 'cuoc', entidad: 'la función CUOC' },
  { prefijo: 'api/cuoc/destrezas', tipo: 'cuoc', entidad: 'la destreza CUOC' },
  { prefijo: 'api/cuoc/conocimientos', tipo: 'cuoc', entidad: 'el conocimiento CUOC' },
  { prefijo: 'api/cuoc/areas-cualificacion', tipo: 'cuoc', entidad: 'el área de cualificación CUOC' },
  { prefijo: 'api/cuoc/niveles-competencia', tipo: 'cuoc', entidad: 'el nivel de competencia CUOC' },
  { prefijo: 'api/cuoc', tipo: 'cuoc', entidad: 'el catálogo CUOC' },
  { prefijo: 'api/correlativa', tipo: 'correlacion', entidad: 'la correlativa' },
  { prefijo: 'api/instrumento2', tipo: 'instrumento', entidad: 'el instrumento 2' },
  { prefijo: 'api/instrumento3', tipo: 'instrumento', entidad: 'el instrumento 3' },
  { prefijo: 'api/analisis', tipo: 'analisis', entidad: 'el análisis' },
  { prefijo: 'api/consulta', tipo: 'cno', entidad: 'el catálogo' },
  { prefijo: 'usuario', tipo: 'usuario', entidad: 'el usuario' },
];

/** Campos de los que se saca el código/identificador que se muestra en el título. */
const CAMPOS_IDENTIFICADOR = [
  'codOcupacionCno',
  'codOcupacionCuoc',
  'codFuncion',
  'codigo',
  'cod',
  'id',
];

/** Campos de los que se saca el nombre legible que va como detalle. */
const CAMPOS_NOMBRE = [
  'nombOcupacionCno',
  'nomOcupacionCuoc',
  'descDenominacion',
  'descFuncionCno',
  'nombre',
  'nombreCompleto',
  'descripcion',
  'message',
];

@Injectable()
export class BitacoraInterceptor implements NestInterceptor {
  constructor(private readonly bitacoraService: BitacoraService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      user?: AuthenticatedUser;
    }>();

    const metodo = (req.method ?? '').toUpperCase();
    const idUsuario = req.user?.idUsuario;
    const ruta = this.normalizarRuta(req.originalUrl ?? req.url ?? '');

    const registrable =
      VERBOS_MUTACION.has(metodo) &&
      !!idUsuario &&
      !RUTAS_EXCLUIDAS.some((patron) => patron.test(ruta));

    if (!registrable) return next.handle();

    return next.handle().pipe(
      tap((respuesta) => {
        const modulo = this.resolverModulo(ruta);
        if (!modulo) return;

        // Fire and forget: registrar() ya se traga sus propios errores, así que
        // no puede retrasar ni tumbar la respuesta que el usuario está esperando.
        void this.bitacoraService.registrar({
          idUsuario: idUsuario!,
          tipo: modulo.tipo,
          titulo: this.componerTitulo(metodo, ruta, modulo.entidad, req, respuesta),
          detalle: this.extraerCampo(CAMPOS_NOMBRE, respuesta, req.body),
        });
      }),
    );
  }

  /** '/api/cno/ocupaciones/9999?x=1' → 'api/cno/ocupaciones/9999' */
  private normalizarRuta(url: string): string {
    return url.split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private resolverModulo(ruta: string): { tipo: string; entidad: string } | null {
    // De más específico a más general: 'api/cno/ocupaciones' debe ganarle a 'api/cno'.
    const candidatos = MODULOS.filter((m) => ruta === m.prefijo || ruta.startsWith(`${m.prefijo}/`));
    if (candidatos.length === 0) return null;
    return candidatos.reduce((a, b) => (b.prefijo.length > a.prefijo.length ? b : a));
  }

  private componerTitulo(
    metodo: string,
    ruta: string,
    entidad: string,
    req: { params?: Record<string, unknown>; body?: Record<string, unknown> },
    respuesta: unknown,
  ): string {
    const verbo = this.resolverVerbo(metodo, ruta);
    const identificador =
      this.primerValor(req.params) ?? this.extraerCampo(CAMPOS_IDENTIFICADOR, respuesta, req.body);

    // El identificador va entre paréntesis porque hay entidades que ya terminan
    // en número ("el instrumento 2"): sin ellos, "el instrumento 2 8" no deja
    // claro dónde acaba el nombre y dónde empieza el código.
    return identificador ? `${verbo} ${entidad} (${identificador})` : `${verbo} ${entidad}`;
  }

  private resolverVerbo(metodo: string, ruta: string): string {
    if (/\/upload(\/|$)|upload-excel|import-batch/.test(ruta)) return 'Cargaste';
    if (/validacion-experta/.test(ruta)) return 'Validaste';
    if (/\/inactivar(\/|$)/.test(ruta)) return 'Inactivaste';
    if (/\/enviar/.test(ruta)) return 'Enviaste';
    if (/\/guardar(\/|$)/.test(ruta)) return 'Guardaste';

    switch (metodo) {
      case 'POST':
        return 'Creaste';
      case 'DELETE':
        return 'Eliminaste';
      default:
        return 'Editaste';
    }
  }

  private primerValor(params?: Record<string, unknown>): string | undefined {
    const valores = Object.values(params ?? {}).map((v) => String(v ?? '').trim());
    return valores.find((v) => v.length > 0);
  }

  /** Primer campo con valor entre varias fuentes (respuesta primero, luego el body enviado). */
  private extraerCampo(campos: string[], ...fuentes: unknown[]): string | undefined {
    for (const fuente of fuentes) {
      if (!fuente || typeof fuente !== 'object' || Array.isArray(fuente)) continue;
      const obj = fuente as Record<string, unknown>;
      for (const campo of campos) {
        const valor = obj[campo];
        if (typeof valor === 'string' && valor.trim().length > 0) return valor.trim().slice(0, 200);
        if (typeof valor === 'number') return String(valor);
      }
    }
    return undefined;
  }
}
