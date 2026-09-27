import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';

/** Restrict a route to the listed roles. Omitting it allows any authenticated user. */
export const Roles = (...roles: readonly Role[]) => SetMetadata(ROLES_KEY, roles);
