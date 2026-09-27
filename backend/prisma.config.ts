import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config. The connection URL lives here for the CLI (migrate, studio,
 * seed) — it is no longer allowed in schema.prisma. The runtime client gets its
 * connection from a driver adapter instead; see src/prisma/prisma.service.ts.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    // tsx, not `node --experimental-strip-types`: Prisma 7 generates the
    // client as TypeScript, and Node's type stripping cannot resolve the
    // `client.js` import specifier to the `client.ts` file on disk.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
