import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ quiet: true });
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith('_test') ||
    new URL(url).pathname ===
      new URL(process.env.DATABASE_URL || 'postgresql://localhost/unconfigured')
        .pathname
  )
    throw new Error('Refusing non-test database');
  const result = spawnSync('pnpm', ['db:seed'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SEED_PASSWORD: 'Synthetic-e2e-password!42',
    },
  });
  if (result.status !== 0) throw new Error('E2E seed failed');
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const { Database } = await import('../apps/api/dist/database.js');
  const db = new Database();
  process.env.DATABASE_URL = originalUrl;
  try {
    await db.rateLimit.deleteMany();
    const syntheticGuides = await db.knowledgeDocument.findMany({
      where: {
        organisationId: '00000000-0000-4000-8000-000000000001',
        title: { startsWith: 'billing-address-guidance' },
        deletedAt: null,
      },
      select: { id: true, objectKey: true },
    });
    if (syntheticGuides.length) {
      const { PrivateStorage } = await import('../apps/api/dist/storage.js');
      const storage = new PrivateStorage();
      for (const guide of syntheticGuides)
        if (guide.objectKey) await storage.delete(guide.objectKey);
      await db.knowledgeDocument.deleteMany({
        where: { id: { in: syntheticGuides.map(({ id }) => id) } },
      });
    }
    if (process.env.SUPPORTIQ_LIVE_GEMINI === '1') {
      const geminiGuides = await db.knowledgeDocument.findMany({
        where: {
          organisationId: '00000000-0000-4000-8000-000000000001',
          title: { startsWith: 'gemini-live-invoice-guide' },
          deletedAt: null,
        },
        select: { id: true, objectKey: true },
      });
      if (geminiGuides.length) {
        const { PrivateStorage } = await import('../apps/api/dist/storage.js');
        const storage = new PrivateStorage();
        for (const guide of geminiGuides)
          if (guide.objectKey) await storage.delete(guide.objectKey);
        await db.knowledgeDocument.deleteMany({
          where: { id: { in: geminiGuides.map(({ id }) => id) } },
        });
      }
      await db.ticket.deleteMany({
        where: {
          organisationId: '00000000-0000-4000-8000-000000000001',
          subject: { startsWith: 'Gemini live: invoice download' },
        },
      });
    }
    await db.ticket.deleteMany({
      where: {
        organisationId: '00000000-0000-4000-8000-000000000001',
        subject: { startsWith: 'AI demo: Help updating my billing address' },
      },
    });
    const sample = await db.ticket.findFirst({
      where: {
        organisationId: '00000000-0000-4000-8000-000000000001',
        subject: 'Help updating my billing address',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (sample) {
      await db.aiDraft.deleteMany({ where: { ticketId: sample.id } });
      await db.message.deleteMany({
        where: {
          ticketId: sample.id,
          body: {
            not: 'I moved recently. How can I update the billing address on my account?',
          },
        },
      });
      await db.ticketEvent.deleteMany({
        where: { ticketId: sample.id, kind: { not: 'CREATED' } },
      });
      await db.ticket.update({
        where: { id: sample.id },
        data: {
          status: 'OPEN',
          priority: 'MEDIUM',
          assigneeId: null,
          version: 1,
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
}
