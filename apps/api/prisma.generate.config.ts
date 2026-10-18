import { defineConfig } from 'prisma/config';

// Client generation is schema-only and must also work in the frontend-free
// Render build context, where database credentials are intentionally absent.
// Migrations use prisma.config.ts, which requires a real DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: 'postgresql://generate:generate@127.0.0.1:5432/generate',
  },
});
