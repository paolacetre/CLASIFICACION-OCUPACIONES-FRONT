import { SetMetadata } from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restringe el endpoint/controlador a los roles indicados. Requiere RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
