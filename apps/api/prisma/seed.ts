import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { passwordHash } from '../src/auth.js';
const password = process.env.SEED_PASSWORD;
if (
  process.env.NODE_ENV === 'production' ||
  !password ||
  password.length < 12 ||
  password.startsWith('choose-')
)
  throw new Error(
    'Set a local SEED_PASSWORD (12+ characters). Seeds are forbidden in production.',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const hashed = await passwordHash(password);
  for (const [index, name, prefix] of [
    [1, 'Acme Studio', 'acme'],
    [2, 'Northstar Labs', 'northstar'],
  ] as const) {
    const orgId = `00000000-0000-4000-8000-00000000000${index}`;
    await db.organisation.upsert({
      where: { id: orgId },
      create: { id: orgId, name },
      update: {},
    });
    for (const [suffix, role, display] of [
      ['admin', 'ADMINISTRATOR', 'Alex Morgan'],
      ['customer', 'CUSTOMER', 'Jamie Chen'],
      ['customer2', 'CUSTOMER', 'Sam Rivera'],
      ['agent', 'AGENT', 'Morgan Lee'],
    ] as const) {
      const user = await db.user.upsert({
        where: { email: `${suffix}@${prefix}.example` },
        create: {
          email: `${suffix}@${prefix}.example`,
          name: display,
          passwordHash: hashed,
        },
        update: {},
      });
      const member = await db.membership.upsert({
        where: {
          userId_organisationId: { userId: user.id, organisationId: orgId },
        },
        create: { userId: user.id, organisationId: orgId, role },
        update: {},
      });
      if (suffix === 'customer') {
        const requestId = `10000000-0000-4000-8000-00000000000${index}`;
        await db.ticket.upsert({
          where: { customerId_requestId: { customerId: member.id, requestId } },
          create: {
            organisationId: orgId,
            customerId: member.id,
            requestId,
            subject: 'Help updating my billing address',
            description:
              'I moved recently. How can I update the billing address on my account?',
            messages: {
              create: {
                authorId: member.id,
                requestId,
                body: 'I moved recently. How can I update the billing address on my account?',
              },
            },
            events: { create: { actorId: member.id, kind: 'CREATED' } },
          },
          update: {},
        });
        if (index === 1) {
          await db.ticket.upsert({
            where: {
              customerId_requestId: {
                customerId: member.id,
                requestId: '10000000-0000-4000-8000-000000000003',
              },
            },
            create: {
              organisationId: orgId,
              customerId: member.id,
              requestId: '10000000-0000-4000-8000-000000000003',
              subject: 'Invoice download fails',
              description:
                'I cannot download my March 2026 invoice. I refreshed the page and signed in again, but the download still fails. Can you help?',
              messages: {
                create: {
                  authorId: member.id,
                  requestId: '10000000-0000-4000-8000-000000000004',
                  body: 'I cannot download my March 2026 invoice. I refreshed the page and signed in again, but the download still fails. Can you help?',
                },
              },
              events: {
                create: { actorId: member.id, kind: 'CREATED' },
              },
            },
            update: {},
          });
        }
      }
      if (suffix === 'admin' && index === 1) {
        await db.knowledgeDocument.upsert({
          where: { id: '20000000-0000-4000-8000-000000000001' },
          create: {
            id: '20000000-0000-4000-8000-000000000001',
            organisationId: orgId,
            createdById: member.id,
            title: 'Downloading an invoice',
            type: 'ARTICLE',
            mediaType: 'text/markdown',
            body: 'Customers can download invoices for completed payments from Account settings, Billing, and Invoice history. Select the invoice month and choose Download PDF. If the download fails, refresh the page, sign in again, and retry using a current browser. If it still does not work, ask the customer to share the invoice month, browser name and version, and any error message. Never ask for a password, full payment-card number, or security code. Support staff may review recurring failures internally; do not tell customers an escalation happened unless the ticket records a completed action.',
            status: 'PENDING',
            jobs: { create: { generation: 1 } },
          },
          update: {},
        });
      }
    }
  }
  console.log(
    'Seeded two synthetic organisations. Account list: docs/demo.md. Existing account passwords are preserved.',
  );
} finally {
  await db.$disconnect();
}
