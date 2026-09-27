import { Role } from '../enums/role.enum.js';

/**
 * The verified identity attached to every authenticated request.
 *
 * Nothing sensitive goes in here — a JWT is base64, not encrypted, and anyone
 * holding the cookie can read its payload.
 */
export interface JwtUser {
  /** users.id */
  sub: number;
  /** employees.id — null for a system admin with no employee record */
  employeeId: number | null;
  email: string;
  role: Role;
  name: string;
}

export interface JwtPayload extends JwtUser {
  iat?: number;
  exp?: number;
}
