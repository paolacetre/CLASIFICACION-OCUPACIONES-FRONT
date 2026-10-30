import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';
import { Role } from '../../../common/enums/role.enum';

/**
 * Protege un controller/endpoint exigiendo JWT válido y, opcionalmente, uno de los
 * roles indicados. Agrupa JwtAuthGuard + RolesGuard + @Roles() + Swagger en un solo
 * decorator para no repetir el mismo bloque en cada controlador protegido.
 */
export function Auth(...roles: Role[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    // Los sistemas externos (APE, Tendencias) entran con API key, solo en GET.
    ApiSecurity('api-key'),
    ApiResponse({ status: 401, description: 'No autenticado (sesión o API key ausente, inválida o expirada)' }),
    ApiResponse({ status: 403, description: 'No tienes permisos para acceder a este recurso' }),
    ...(roles.length ? [Roles(...roles)] : []),
  );
}
