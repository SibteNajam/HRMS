export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  HR = 'HR',
  ADMIN = 'ADMIN',
}

/** Convenience sets used by @Roles(). ADMIN is a superset of HR. */
export const ALL_ROLES = [Role.EMPLOYEE, Role.HR, Role.ADMIN] as const;
export const HR_AND_ABOVE = [Role.HR, Role.ADMIN] as const;
export const ADMIN_ONLY = [Role.ADMIN] as const;
