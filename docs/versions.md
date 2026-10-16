# Selected versions

Metadata read from the public npm registry on 2026-10-16. Exact direct versions below; transitive versions are in pnpm-lock.yaml.

```json
{
  "runtime": "Node 22.18.0 (verified locally); Node 22 line",
  "pnpm": "10.34.7",
  "api": {
    "@nestjs/common": "12.1.3",
    "@nestjs/core": "12.1.3",
    "@nestjs/platform-express": "12.1.3",
    "@nestjs/swagger": "12.0.2",
    "@aws-sdk/client-s3": "3.1152.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "argon2": "0.45.1",
    "cookie-parser": "1.4.7",
    "helmet": "8.3.0",
    "express": "5.3.0",
    "pg": "8.23.1",
    "dotenv": "18.0.8",
    "multer": "2.4.0",
    "nodemailer": "10.1.1",
    "pdf-parse": "2.4.5",
    "@prisma/client": "7.10.1",
    "@prisma/adapter-pg": "7.10.1",
    "@supportiq/contracts": "workspace:*"
  },
  "web": {
    "next": "16.4.2",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "tailwindcss": "4.3.3",
    "@tailwindcss/postcss": "4.3.3",
    "lucide-react": "1.58.0",
    "@supportiq/contracts": "workspace:*"
  },
  "contracts": {
    "zod": "4.6.7"
  },
  "tooling": {
    "@types/node": "26.6.5",
    "@types/express": "5.0.6",
    "@types/cookie-parser": "1.4.10",
    "@types/pg": "8.23.1",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@types/supertest": "7.2.1",
    "supertest": "7.3.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@testing-library/jest-dom": "7.0.1",
    "jsdom": "30.1.3",
    "prettier": "3.9.10",
    "eslint": "10.12.0",
    "typescript-eslint": "8.71.2",
    "eslint-plugin-react-hooks": "7.1.1",
    "concurrently": "10.0.6",
    "tsx": "4.23.15",
    "jest": "30.5.2",
    "@playwright/test": "1.64.1",
    "typescript": "5.9.3",
    "prisma": "7.10.1",
    "vitest": "4.1.12"
  }
}
```

Prisma 8 was tagged latest but was a release candidate, so select stable Prisma 7.10.1 with the matching client and PostgreSQL driver adapter. Nest 12 is ESM-only; the backend and contracts use NodeNext ESM. TypeScript 5.9.3 remains supported by these packages. Vitest 4.1.12 supports the installed Node 22.18 runtime; Vitest 5 is intentionally not selected. Next 16 supports React 19 and Node >=20.9. Prisma 7 supports Node ^22.12.

Official references: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Nest migration guide](https://docs.nestjs.com/migration-guide), [Prisma requirements](https://docs.prisma.io/docs/orm/reference/system-requirements), [Prisma PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).

Infrastructure: PostgreSQL 17 with pgvector 0.8.7 (`pgvector/pgvector:0.8.7-pg17-trixie`); MinIO built locally from official source RELEASE.2025-10-15T17-29-55Z with Go 1.24.8 and Debian bookworm-slim; Mailpit v1.27.8. Image availability/runtime validation is recorded separately in progress.md. Images are version-tagged; deployment should additionally pin reviewed digests.

Additional direct dependencies: root pnpm 10.34.7 and dotenv 18.0.8; web dotenv 18.0.8; API Zod matches packages/contracts. API file/email dependencies are `@aws-sdk/client-s3` 3.1152.0, Multer 2.4.0, Nodemailer 10.1.1, and pdf-parse 2.4.5. pnpm is also a local dev dependency so scripts work after an npx-based install without a global binary. Prisma uses the current `prisma-client` generator with explicit backend-only output and ESM imports; the legacy client-js generator failed package resolution in this pnpm workspace.

MinIO registry pulls actually failed (Docker Hub access denied; Quay HTTP 401). The local source build succeeded. Official [release and build guidance](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) and [Go requirements](https://raw.githubusercontent.com/minio/minio/RELEASE.2025-10-15T17-29-55Z/go.mod). This is a pinned development dependency, not a claim that this release is currently production-supported. Reassess before deployment.
