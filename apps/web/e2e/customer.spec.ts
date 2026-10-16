import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const password = 'Synthetic-e2e-password!42';
async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign out' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
test('customer creates, searches, opens and retains a real ticket after login', async ({
  page,
}) => {
  await mkdir('docs/screenshots', { recursive: true });
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/login.png', fullPage: true });
  await login(page, 'customer@acme.example');
  await expect(
    page.getByRole('heading', { name: 'My requests.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'New request', exact: true }).click();
  const subject = 'Billing address update ' + Date.now();
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page
    .getByLabel('How can we help?')
    .fill('I moved recently and need help updating the billing address.');
  await page.getByLabel('Priority', { exact: true }).selectOption('HIGH');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(
    page.getByRole('heading', { name: subject, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'I moved recently and need help updating the billing address.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: subject, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/ticket-detail.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'All requests', exact: true }).click();
  await page.getByLabel('Search requests').fill(subject);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByText('1 request · Page 1 of 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link').filter({ hasText: subject }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/customer-requests.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/screenshots/customer-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await login(page, 'customer@acme.example');
  await expect(
    page.getByRole('link').filter({ hasText: subject }),
  ).toBeVisible();
});
test('administrator registers and onboards a customer through a private single-use link', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Taylor Support');
  await page.getByLabel('Organisation name').fill('Synthetic Studio ' + stamp);
  await page
    .getByLabel('Email address')
    .fill(`admin-${stamp}@synthetic.example`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await page
    .getByRole('link', { name: 'Customer access', exact: true })
    .click();
  await page.getByRole('button', { name: 'Create customer link' }).click();
  const url = await page.getByLabel('Private join link').inputValue();
  expect(url).toContain('/join#');
  const context = await browser.newContext();
  const customer = await context.newPage();
  try {
    await customer.goto(url);
    await customer.getByLabel('Full name').fill('Riley Customer');
    await customer
      .getByLabel('Email address')
      .fill(`customer-${stamp}@synthetic.example`);
    await customer.getByLabel('Password', { exact: true }).fill(password);
    await customer.getByRole('button', { name: 'Join support portal' }).click();
    await expect(
      customer.getByRole('heading', { name: 'My requests.' }),
    ).toBeVisible();
    await expect(
      customer.getByRole('link', { name: 'Customer access', exact: true }),
    ).toHaveCount(0);
    await customer
      .getByRole('link', { name: 'New request', exact: true })
      .click();
    await customer
      .getByLabel('Subject', { exact: true })
      .fill('New portal request');
    await customer
      .getByLabel('How can we help?')
      .fill('This is a newly onboarded customer request.');
    await customer.getByRole('button', { name: 'Submit request' }).click();
    await expect(
      customer.getByRole('heading', {
        name: 'New portal request',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
