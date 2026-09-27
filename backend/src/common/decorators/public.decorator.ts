import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opens a route to unauthenticated requests.
 *
 * Guards are registered globally, so everything is protected by default and
 * opening a route is an explicit, reviewable act. Only login and health use it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
