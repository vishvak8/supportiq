import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { passwordHash } from '../src/auth.js';

const password = process.env.PUBLIC_DEMO_PASSWORD;
if (
  process.env.ENABLE_PUBLIC_DEMO_SEED !== '1' ||
  !password ||
  password.length < 12
)
  throw new Error(
    'Explicit setup only: set ENABLE_PUBLIC_DEMO_SEED=1 and PUBLIC_DEMO_PASSWORD (12+ characters).',
  );
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required for public demo seeding');

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const organisationId = '00000000-0000-4000-8000-000000000031';
const agentEmail = 'demo-agent@supportiq.example';
const customerEmail = 'demo-customer@supportiq.example';
const passwordHashValue = await passwordHash(password);

try {
  await db.organisation.upsert({
    where: { id: organisationId },
    create: { id: organisationId, name: 'SupportIQ Public Demo' },
    update: {},
  });
  const agentUser = await db.user.upsert({
    where: { email: agentEmail },
    create: {
      email: agentEmail,
      name: 'Demo Support Agent',
      passwordHash: passwordHashValue,
    },
    update: {},
  });
  const customerUser = await db.user.upsert({
    where: { email: customerEmail },
    create: {
      email: customerEmail,
      name: 'Demo Customer',
      passwordHash: passwordHashValue,
    },
    update: {},
  });
  const agent = await db.membership.upsert({
    where: {
      userId_organisationId: { userId: agentUser.id, organisationId },
    },
    create: { userId: agentUser.id, organisationId, role: 'AGENT' },
    update: {},
  });
  const customer = await db.membership.upsert({
    where: {
      userId_organisationId: { userId: customerUser.id, organisationId },
    },
    create: { userId: customerUser.id, organisationId, role: 'CUSTOMER' },
    update: {},
  });

  await db.ticket.upsert({
    where: {
      customerId_requestId: {
        customerId: customer.id,
        requestId: '10000000-0000-4000-8000-000000000031',
      },
    },
    create: {
      organisationId,
      customerId: customer.id,
      assigneeId: agent.id,
      requestId: '10000000-0000-4000-8000-000000000031',
      subject: 'Invoice download fails',
      description:
        'I cannot download my March 2026 invoice. I refreshed the page and signed in again, but the download still fails. Can you help?',
      messages: {
        create: {
          authorId: customer.id,
          requestId: '10000000-0000-4000-8000-000000000032',
          body: 'I cannot download my March 2026 invoice. I refreshed the page and signed in again, but the download still fails. Can you help?',
        },
      },
      events: {
        create: { actorId: customer.id, kind: 'CREATED' },
      },
    },
    update: {},
  });

  await db.knowledgeDocument.upsert({
    where: { id: '20000000-0000-4000-8000-000000000031' },
    create: {
      id: '20000000-0000-4000-8000-000000000031',
      organisationId,
      createdById: agent.id,
      title: 'Downloading an invoice',
      type: 'ARTICLE',
      mediaType: 'text/markdown',
      body: 'Customers can download invoices for completed payments from Account settings, Billing, and Invoice history. Select the invoice month and choose Download PDF. If the download fails, refresh the page, sign in again, and retry using a current browser. If it still does not work, ask the customer to share the invoice month, browser name and version, and any error message. Never ask for a password, full payment-card number, or security code. Support staff may review recurring failures internally; do not tell customers an escalation happened unless the ticket records a completed action.',
      status: 'PENDING',
      jobs: { create: { generation: 1 } },
    },
    update: {},
  });
  await db.knowledgeDocument.upsert({
    where: { id: '20000000-0000-4000-8000-000000000032' },
    create: {
      id: '20000000-0000-4000-8000-000000000032',
      organisationId,
      createdById: agent.id,
      title: 'Billing address changes',
      type: 'ARTICLE',
      mediaType: 'text/markdown',
      body: 'Customers can change a saved billing address in Account settings under Billing details. Save the updated address before placing the next order. If the address does not save, ask which browser they use and what message appears. Do not request passwords or complete payment-card details.',
      status: 'PENDING',
      jobs: { create: { generation: 1 } },
    },
    update: {},
  });
  process.stdout.write(
    'Seeded the synthetic public demo organisation, limited agent/customer accounts, invoice ticket, and two knowledge articles. Existing accounts and passwords were preserved. Restart the API once to drain queued document ingestion.\n',
  );
} finally {
  await db.$disconnect();
}
