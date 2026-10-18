import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { chromium, expect } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { databaseFailureDiagnostic } from '../dist/database-diagnostics.js';

config({ quiet: true });

const organisationId = '00000000-0000-4000-8000-000000000031';
const demoAgent = 'demo-agent@supportiq.example';
const demoCustomer = 'demo-customer@supportiq.example';
const webUrl = new URL(
  process.env.SUPPORTIQ_WEB_URL || 'https://supportiq-web-free.onrender.com',
);
const apiUrl = new URL(
  process.env.SUPPORTIQ_API_URL || 'https://supportiq-api-free.onrender.com',
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const networkFailures = [];
let step = 'initializing';

function safePath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname
      .split('/')
      .map((segment) =>
        /^[0-9]+$/.test(segment) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
        segment.length > 24
          ? '[redacted]'
          : segment,
      )
      .join('/');
    return { host: url.host, path };
  } catch {
    return { host: '[unknown]', path: '[unknown]' };
  }
}

function attachPageDiagnostics(page) {
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    networkFailures.push({
      kind: 'http',
      ...safePath(response.url()),
      method: request.method(),
      status: response.status(),
    });
    if (networkFailures.length > 12) networkFailures.shift();
  });
  page.on('requestfailed', (request) => {
    const code = request.failure()?.errorText?.match(/net::ERR_[A-Z_]+/)?.[0];
    networkFailures.push({
      kind: 'network',
      ...safePath(request.url()),
      method: request.method(),
      code: code || 'request_failed',
    });
    if (networkFailures.length > 12) networkFailures.shift();
  });
}

function safeBrowserError(error) {
  const name = error instanceof Error ? error.name : 'Error';
  let message = error instanceof Error ? error.message : 'Unknown failure';
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[database-url]')
    .replace(/https?:\/\/[^\s"']+/gi, '[url]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(
      /(password|cookie|token|authorization|secret|api[-_]?key)(\s*[:=]\s*)[^\s,;]+/gi,
      '$1$2[redacted]',
    )
    .slice(0, 500);
  return { name, message };
}

async function readHidden(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error('Run this command in your Mac Terminal.');

  process.stderr.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk) => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003') {
            process.stdin.off('data', onData);
            reject(new Error('Cancelled.'));
            return;
          }
          if (character === '\r' || character === '\n') {
            process.stdin.off('data', onData);
            process.stderr.write('\n');
            resolve(value);
            return;
          }
          if (character === '\u007f' || character === '\b')
            value = value.slice(0, -1);
          else if (value.length < 4096) value += character;
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

function validateConnectionString(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The database URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('The database URL must use PostgreSQL.');
  if (url.searchParams.get('sslmode') !== 'verify-full')
    throw new Error('Use sslmode=verify-full.');
  const caPath = url.searchParams.get('sslrootcert');
  if (!caPath || !caPath.startsWith('/Users/'))
    throw new Error('Use the local Mac CA certificate path in sslrootcert.');
  return { url, caPath };
}

async function waitForReady() {
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const response = await fetch(new URL('/health/ready', apiUrl), {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.status === 'ready') return;
      }
    } catch {
      // A sleeping Free instance can take time to wake; retry this safe GET.
    }
    await sleep(5000);
  }
  throw new Error('The hosted API did not become ready.');
}

async function login(page, email, password) {
  step = 'open customer sign-in page';
  await page.goto(new URL('/login', webUrl).toString());
  step = 'locate sign-in fields';
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  step = 'submit sign-in';
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  step = 'wait for signed-in workspace';
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({
    timeout: 60000,
  });
}

async function logout(page) {
  step = 'submit sign-out';
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes('/api/auth/logout') &&
      candidate.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  step = 'verify sign-out response';
  if ((await response).status() !== 201)
    throw new Error('Logout did not complete.');
  step = 'verify signed-out page';
  await expect(page.getByLabel('Email address')).toBeVisible({
    timeout: 15000,
  });
}

async function main() {
  let browser;
  let page;
  let stage = 'credentials';
  let db;
  try {
    const connectionString = await readHidden(
      'Paste the locally verified Supabase DATABASE_URL (hidden): ',
    );
    const { caPath } = validateConnectionString(connectionString);
    const certificate = await readFile(caPath, 'utf8');
    if (!certificate.includes('-----BEGIN CERTIFICATE-----'))
      throw new Error('The local CA file is not a PEM certificate.');

    stage = 'read-only database preflight';
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    await db.$queryRaw`SELECT 1`;
    process.stdout.write('Read-only Supabase connection check passed.\n');

    const existingAccounts = await db.user.findMany({
      where: { email: { in: [demoAgent, demoCustomer] } },
      select: { email: true },
    });
    const existingArticles = await db.knowledgeDocument.findMany({
      where: {
        organisationId,
        id: {
          in: [
            '20000000-0000-4000-8000-000000000031',
            '20000000-0000-4000-8000-000000000032',
          ],
        },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    const seedRequired =
      existingAccounts.length < 2 ||
      existingArticles.length < 2 ||
      existingArticles.some((article) => article.status !== 'READY');
    const existingEmails = new Set(existingAccounts.map(({ email }) => email));
    process.stdout.write(
      `Demo account status (email only): agent=${existingEmails.has(demoAgent) ? 'exists' : 'new'}, customer=${existingEmails.has(demoCustomer) ? 'exists' : 'new'}. Articles ready=${existingArticles.length === 2 && existingArticles.every((article) => article.status === 'READY') ? 'yes' : 'no'}. Existing passwords will not be changed.\n`,
    );
    const password = await readHidden(
      existingAccounts.length
        ? 'Enter the currently working shared demo password (hidden; Ctrl-C cancels if unknown): '
        : 'Choose the PUBLIC_DEMO_PASSWORD for both demo accounts (hidden): ',
    );
    if (password.length < 12)
      throw new Error('The demo password must contain at least 12 characters.');

    browser = await chromium.launch({ headless: true });

    if (existingAccounts.length > 0) {
      stage = 'verify existing demo account credentials';
      step = 'open existing-account sign-in page';
      const existingPage = await browser.newPage();
      attachPageDiagnostics(existingPage);
      existingPage.setDefaultTimeout(60000);
      try {
        for (const email of existingAccounts.map(({ email }) => email)) {
          step = 'verify existing demo account sign-in';
          await login(existingPage, email, password);
          await logout(existingPage);
        }
      } finally {
        await existingPage.close();
      }
      process.stdout.write(
        'Existing demo account credentials checked before seeding.\n',
      );
    }

    await db.$disconnect();
    db = undefined;

    if (seedRequired) {
      stage = 'synthetic public demo seed';
      step = 'run guarded synthetic seed';
      const seed = spawnSync('pnpm', ['exec', 'tsx', 'prisma/seed-demo.ts'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
          ENABLE_PUBLIC_DEMO_SEED: '1',
          PUBLIC_DEMO_PASSWORD: password,
        },
        timeout: 120000,
      });
      if (seed.status !== 0)
        throw new Error(
          'The guarded seed command failed; details were suppressed.',
        );
      process.stdout.write(
        'Synthetic seed completed. Existing user passwords were preserved.\n',
      );
    } else {
      process.stdout.write(
        'Existing synthetic accounts and READY articles found; seed skipped.\n',
      );
    }
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });

    stage = 'hosted API readiness';
    step = 'wait for hosted API health';
    await waitForReady();
    process.stdout.write('Hosted API readiness passed (HTTP 200).\n');

    stage = 'durable document ingestion';
    step = 'wait for seeded articles to become READY';
    let documents = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      documents = await db.knowledgeDocument.findMany({
        where: {
          organisationId,
          id: {
            in: [
              '20000000-0000-4000-8000-000000000031',
              '20000000-0000-4000-8000-000000000032',
            ],
          },
          deletedAt: null,
        },
        select: { title: true, status: true },
      });
      if (
        documents.length === 2 &&
        documents.every((document) => document.status === 'READY')
      )
        break;
      if (documents.some((document) => document.status === 'FAILED'))
        throw new Error('At least one seeded article failed ingestion.');
      await sleep(5000);
    }
    if (
      documents.length !== 2 ||
      documents.some((document) => document.status !== 'READY')
    )
      throw new Error(
        'Seeded articles did not reach READY within five minutes.',
      );
    process.stdout.write(
      `Durable ingestion passed: ${documents.length} synthetic articles are READY.\n`,
    );

    stage = 'customer login, ticket creation, and private attachment';
    networkFailures.length = 0;
    page = await browser.newPage();
    attachPageDiagnostics(page);
    page.setDefaultTimeout(60000);
    await login(page, demoCustomer, password);
    step = 'verify customer request list';
    await expect(
      page.getByRole('heading', { name: 'My requests.' }),
    ).toBeVisible();
    step = 'open new request form';
    await page.getByRole('link', { name: 'New request', exact: true }).click();
    const stamp = Date.now();
    const subject = `Hosted smoke ${stamp}`;
    step = 'fill synthetic ticket form';
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await page
      .getByLabel('How can we help?')
      .fill('This synthetic ticket checks our hosted support workflow.');
    step = 'submit synthetic ticket';
    await page.getByRole('button', { name: 'Submit request' }).click();
    step = 'wait for created ticket page';
    await expect(page.getByRole('heading', { name: subject })).toBeVisible();
    const attachmentName = `synthetic-${stamp}.txt`;
    step = 'fill synthetic customer reply';
    await page
      .getByLabel('Your reply')
      .fill('I attached a synthetic details file.');
    await page.getByLabel('Attachments').setInputFiles({
      name: attachmentName,
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Synthetic private attachment for SupportIQ verification.',
      ),
    });
    step = 'send customer reply with private attachment';
    const uploadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/attachments'),
    );
    await Promise.all([
      page.getByRole('button', { name: 'Send reply' }).click(),
      uploadResponse,
    ]);
    const attachmentUpload = await uploadResponse;
    if (!attachmentUpload.ok()) {
      step = `attachment upload returned HTTP ${attachmentUpload.status()}`;
      throw new Error(
        `Attachment upload returned HTTP ${attachmentUpload.status()}`,
      );
    }
    const attachment = page.getByRole('link', { name: attachmentName });
    step = 'verify attachment appears in conversation';
    await expect(attachment).toBeVisible();
    step = 'download attachment as owner';
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      attachment.click(),
    ]);
    if (
      download.suggestedFilename() !== attachmentName ||
      (await download.failure())
    )
      throw new Error('Private attachment download failed.');
    const attachmentPath = await attachment.getAttribute('href');
    if (!attachmentPath) throw new Error('Attachment link was missing.');
    const anonymousContext = await browser.newContext();
    try {
      step = 'verify anonymous attachment access is denied';
      const anonymousResponse = await anonymousContext.request.get(
        new URL(attachmentPath, webUrl).toString(),
      );
      if (![401, 403].includes(anonymousResponse.status()))
        throw new Error('Attachment endpoint allowed an anonymous request.');
    } finally {
      await anonymousContext.close();
    }
    process.stdout.write(
      'Customer login, ticket creation, private attachment download, and anonymous attachment denial passed.\n',
    );

    stage = 'agent reply and internal-note privacy';
    await logout(page);
    await login(page, demoAgent, password);
    await page.getByRole('link').filter({ hasText: subject }).click();
    const note = `Internal smoke note ${stamp}`;
    await page.getByLabel('Add as an internal note').check();
    await page.getByRole('textbox', { name: 'Internal note' }).fill(note);
    await page.getByRole('button', { name: 'Add internal note' }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await page.getByLabel('Add as an internal note').uncheck();
    const agentReply =
      'Thanks for the synthetic report. Our support team received it.';
    await page.getByLabel('Public reply').fill(agentReply);
    await page.getByRole('button', { name: 'Send public reply' }).click();
    await expect(page.getByText(agentReply, { exact: true })).toBeVisible();
    await logout(page);
    await login(page, demoCustomer, password);
    await page.getByRole('link').filter({ hasText: subject }).click();
    await expect(page.getByText(agentReply, { exact: true })).toBeVisible();
    await expect(page.getByText(note, { exact: true })).toHaveCount(0);
    process.stdout.write(
      'Agent public reply and customer privacy of internal notes passed.\n',
    );

    stage = 'cited AI draft, edit, approval, and explicit send';
    await logout(page);
    await login(page, demoAgent, password);
    await page
      .getByRole('link')
      .filter({ hasText: 'Invoice download fails' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Invoice download fails' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Draft a reply with AI' }).click();
    const draftCard = page.locator('.ai-draft').filter({
      has: page.getByText('Downloading an invoice · cited source', {
        exact: true,
      }),
    });
    await expect(draftCard).toBeVisible({ timeout: 90000 });
    const draftField = draftCard.getByLabel('Edit AI draft');
    const generatedReply = await draftField.inputValue();
    if (!generatedReply.trim() || !/\b(you|your)\b/i.test(generatedReply))
      throw new Error('Generated reply was empty or not customer-facing.');
    await draftCard
      .getByText('Downloading an invoice · cited source', { exact: true })
      .click();
    const excerpt = await draftCard.locator('blockquote').innerText();
    if (!/browser name and version/i.test(excerpt))
      throw new Error(
        'The cited source excerpt did not match the invoice article.',
      );

    const editedReply =
      'Thanks for letting us know. Since refreshing and signing in again did not fix the invoice download, please open Account settings, choose Billing, then Invoice history and select Download PDF for March 2026. If it still fails, please share your browser name and version and any error message you see. Please do not send your password or full payment-card details.';
    await draftField.fill(editedReply);
    await expect(page.locator('.conversation')).not.toContainText(editedReply);
    await draftCard
      .getByRole('button', { name: 'I reviewed this draft · approve' })
      .click();
    await expect(
      draftCard.getByRole('button', { name: 'Send approved reply' }),
    ).toBeVisible();
    await expect(page.locator('.conversation')).not.toContainText(editedReply);
    await draftCard
      .getByRole('button', { name: 'Send approved reply' })
      .click();
    await expect(page.locator('.conversation')).toContainText(editedReply);
    await expect(draftCard.getByText('Sent as a public reply.')).toBeVisible();

    await logout(page);
    await login(page, demoCustomer, password);
    await page
      .getByRole('link')
      .filter({ hasText: 'Invoice download fails' })
      .click();
    await expect(page.locator('.conversation')).toContainText(editedReply);

    process.stdout.write(
      'Cited draft generated and inspected; edited, explicitly approved, and explicitly sent.\n',
    );
    process.stdout.write(
      `LIVE_HOSTED_AI_REPLY ${JSON.stringify({ reply: generatedReply, citation: 'Downloading an invoice', excerpt })}\n`,
    );
    process.stdout.write('All hosted synthetic demo checks passed.\n');
  } catch (error) {
    if (stage === 'read-only database preflight') {
      process.stderr.write(
        `${JSON.stringify({
          event: 'hosted_demo_check_failed',
          stage,
          step,
          ...databaseFailureDiagnostic(error),
        })}\n`,
      );
    } else {
      process.stderr.write(
        `${JSON.stringify({
          event: 'hosted_demo_check_failed',
          stage,
          step,
          error: safeBrowserError(error),
          networkFailures: networkFailures.slice(-8),
          page: page ? safePath(page.url()) : undefined,
        })}\n`,
      );
    }
    process.exitCode = 1;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (db) await db.$disconnect().catch(() => {});
  }
}

await main();
