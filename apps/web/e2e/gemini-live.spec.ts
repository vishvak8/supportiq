import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Client } = require('pg') as {
  Client: new (options: { connectionString: string }) => {
    connect(): Promise<void>;
    query(
      sql: string,
      values: string[],
    ): Promise<{ rows: { chunks: number; dimensions: number[] }[] }>;
    end(): Promise<void>;
  };
};

const enabled = process.env.SUPPORTIQ_LIVE_GEMINI === '1';
test.skip(!enabled, 'Set SUPPORTIQ_LIVE_GEMINI=1 to call the real Gemini API');

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Synthetic-e2e-password!42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

test('live Gemini embeds an uploaded article, retrieves it and drafts a cited reply', async ({
  page,
}) => {
  test.setTimeout(300000);
  if (process.env.AI_PROVIDER !== 'gemini')
    throw new Error('Run with AI_PROVIDER=gemini');
  const fileName = 'gemini-live-invoice-guide.md';
  const subject = 'Gemini live: invoice download failure';

  await login(page, 'admin@acme.example');
  await page.getByRole('link', { name: 'Knowledge base', exact: true }).click();
  await page.getByLabel('Upload PDF, Markdown, or text').setInputFiles({
    name: fileName,
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      'To download an invoice, open Account settings, choose Billing, and select Invoice history. Choose the invoice month and select Download PDF. If the download still fails after refreshing the page and signing in again, please share the invoice month, your browser name and version, and any error message you see. Never ask for a password, full payment-card number, or security code. Support staff may review recurring failures internally; do not tell customers an escalation happened unless a completed action is recorded.',
    ),
  });
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/knowledge/uploads') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Upload document' }).click();
  expect((await uploadResponse).status()).toBe(201);
  const guide = page.locator('.knowledge-row').filter({ hasText: fileName });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText(/ready/i, { timeout: 120000 });
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const database = new Client({ connectionString: testDatabaseUrl });
  await database.connect();
  let indexedDimensions: number[] = [];
  try {
    const result = await database.query(
      `SELECT count(*)::int AS chunks, array_agg(DISTINCT vector_dims(c."embedding")) AS dimensions
       FROM "DocumentChunk" c JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
       WHERE c."organisationId" = $1::uuid AND d.title = $2 AND d.status = 'READY'::"DocumentStatus"`,
      ['00000000-0000-4000-8000-000000000001', fileName],
    );
    expect(result.rows[0].chunks).toBeGreaterThan(0);
    indexedDimensions = result.rows[0].dimensions;
    expect(indexedDimensions).toEqual([768]);
  } finally {
    await database.end();
  }

  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'customer@acme.example');
  await page.getByRole('link', { name: 'New request', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page
    .getByLabel('How can we help?')
    .fill(
      'I cannot download my March 2026 invoice. I refreshed the page and signed in again, but it still fails. Can you help?',
    );
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'agent@acme.example');
  await page.getByRole('link').filter({ hasText: subject }).click();
  await page.getByRole('button', { name: 'Draft a reply with AI' }).click();
  const draftCard = page.locator('.ai-draft').filter({ hasText: fileName });
  await expect(draftCard).toBeVisible({ timeout: 90000 });
  const generated = await draftCard.getByLabel('Edit AI draft').inputValue();
  expect(generated.length).toBeGreaterThan(30);
  expect(generated).toMatch(/\b(you|your)\b/i);
  expect(generated).toMatch(/\binvoice month\b/i);
  expect(generated).not.toMatch(/\bask (?:the customer|for the)\b/i);
  expect(generated).not.toMatch(
    /\b(?:we|our team) (?:have |has )?(?:escalated|refunded|emailed)\b/i,
  );

  const citation = draftCard.locator('details').filter({
    has: page.getByText(`${fileName} · cited source`, { exact: true }),
  });
  await expect(citation).toHaveCount(1);
  await citation.locator('summary').click();
  const excerpt = citation.locator('blockquote');
  await expect(excerpt).toContainText('invoice month');
  await expect(excerpt).toContainText('browser name and version');
  await page.screenshot({
    path: 'docs/screenshots/ai-draft-gemini-live.png',
    fullPage: true,
  });

  // This log contains only generated text from the synthetic ticket/source.
  // The Gemini API key is never included in the prompt or printed.
  console.info(
    `LIVE_GEMINI_OBSERVED ${JSON.stringify({
      model: process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite',
      embeddingModel:
        process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
      indexedDimensions,
      reply: generated,
      citation: fileName,
      sourceExcerpt: await excerpt.innerText(),
    })}`,
  );

  const reviewed =
    'Thanks for letting us know. You can open Account settings, choose Billing, then Invoice history and select Download PDF for March 2026. Since refreshing and signing in again did not fix it, please share your browser name and version and any error message you see. Please do not send a password or payment-card details.';
  await draftCard.getByLabel('Edit AI draft').fill(reviewed);
  await draftCard
    .getByRole('button', { name: 'I reviewed this draft · approve' })
    .click();
  await expect(
    draftCard.getByRole('button', { name: 'Send approved reply' }),
  ).toBeVisible();
  await expect(page.locator('.conversation')).not.toContainText(reviewed);
  await draftCard.getByRole('button', { name: 'Send approved reply' }).click();
  await expect(page.locator('.conversation')).toContainText(reviewed);
});
