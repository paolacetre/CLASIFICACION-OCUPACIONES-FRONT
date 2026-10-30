import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Códigos SQLSTATE de Postgres que son un error del cliente, no del servidor. */
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /**
   * Intercepta y da formato a las excepciones lanzadas por la aplicación antes de ser devueltas al cliente.
   * Centraliza el manejo de errores asegurando una respuesta JSON con estructura uniforme.
   *
   * @param {unknown} exception - La excepción o error capturado por NestJS.
   * @param {ArgumentsHost} host - Objeto de contexto de ejecución que permite acceder a Request y Response.
   * @returns {void} No retorna valor explícito, muta el objeto response de Express de forma directa.
   *
   * @example
   * // En el main.ts se inyecta de forma global:
   * app.useGlobalFilters(new AllExceptionsFilter());
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } =
      exception instanceof HttpException
        ? { status: exception.getStatus(), message: exception.getResponse() }
        : this.desdeBaseDeDatos(exception) ?? {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          };

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }

  /**
   * Red de seguridad para los servicios que no validan antes de escribir: una
   * FK o un índice único rotos son un dato mal enviado, no una caída del
   * servidor, y responder 500 escondía el motivo.
   */
  private desdeBaseDeDatos(exception: unknown): { status: number; message: string } | null {
    if (!(exception instanceof QueryFailedError)) return null;
    const { code, detail } = (exception as QueryFailedError & { driverError?: { code?: string; detail?: string } })
      .driverError ?? {};

    if (code === PG_FOREIGN_KEY_VIOLATION) {
      // "is still referenced" = se intentó borrar algo en uso; si no, se
      // intentó enlazar con un registro que no existe.
      return /still referenced/i.test(detail ?? '')
        ? { status: HttpStatus.CONFLICT, message: 'No se puede eliminar: otros registros dependen de este.' }
        : { status: HttpStatus.NOT_FOUND, message: 'El registro relacionado no existe.' };
    }
    if (code === PG_UNIQUE_VIOLATION) {
      return { status: HttpStatus.CONFLICT, message: 'Ya existe un registro con esos datos.' };
    }
    return null;
  }
}
