import { test, expect, type Page } from '@playwright/test';
async function demo(page: Page, role = 'Member') {
  await page.goto('/login');
  await page.getByRole('button', { name: `${role} preview` }).click();
  await expect(page).toHaveURL(role === 'Admin' ? /\/app\/admin/ : /\/app$/);
}
test('public funnel, registration, onboarding and real account persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Build the system.',
  );
  await page.getByRole('link', { name: 'Join Builder', exact: true }).click();
  await page.getByLabel('Your name').fill('Browser Test Member');
  await page
    .getByLabel('Email address')
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Example only password 427!');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'What are you building toward?' }),
  ).toBeVisible();
  await page
    .getByLabel('What are you trying to accomplish?')
    .fill('Automate the sales qualification process for my company.');
  await page
    .getByLabel('Industry', { exact: true })
    .fill('Professional services');
  await page.getByRole('button', { name: 'Make it mine' }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings & membership' }),
  ).toBeVisible();
  await expect(
    page.getByText('Verify your email address.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Browser Test Member',
  );
  await expect(page.getByLabel('Your current goal')).toHaveValue(
    'Automate the sales qualification process for my company.',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/app/admin');
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});
test('member saves and finds a resource, submits an idea, messages and creates a project', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demo(page);
  await page
    .getByRole('textbox', { name: 'What are you trying to accomplish?' })
    .fill('I want an inbound sales qualification workflow');
  await page.getByRole('button', { name: 'Find my path' }).click();
  await expect(page.locator('.goal-result')).toContainText(
    'accessible resources',
  );
  await page.goto('/app/library');
  await page.getByLabel('Search resources').fill('qualification');
  await expect(
    page.getByRole('heading', { name: 'A better first conversation.' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Save A better first conversation.',
      exact: true,
    })
    .click();
  await page
    .getByRole('link', { name: 'A better first conversation.', exact: true })
    .click();
  await expect(page.locator('.prose')).toContainText('The operating contract');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Saved to workspace', exact: true }),
  ).toBeVisible();
  await page.goto('/app/build');
  await page.getByRole('button', { name: 'Submit an idea' }).click();
  await page
    .getByLabel('Give your idea a clear title')
    .fill('Browser QA qualification request');
  await page
    .getByLabel('The outcome you want')
    .fill(
      'A reusable qualification workflow with evidence and human approval.',
    );
  await page.getByLabel('Main bottleneck').fill('Private test context only');
  await page.getByRole('button', { name: 'Submit to the Build Queue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser QA qualification request' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Browser QA qualification request' }),
  ).toBeVisible();
  await page.goto('/app/community?room=ai-systems');
  await page
    .getByLabel('Message AI Systems')
    .fill('Browser QA: testing a reliable qualification system.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.locator('.message-content').filter({
      hasText: 'Browser QA: testing a reliable qualification system.',
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('.message-content').filter({
      hasText: 'Browser QA: testing a reliable qualification system.',
    }),
  ).toBeVisible();
  await page.goto('/app/workspace');
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByLabel('Project name', { exact: true })
    .fill('Browser QA project');
  await page
    .getByLabel('The goal', { exact: true })
    .fill('Build a reliable lead qualification system.');
  await page
    .getByLabel('A better first conversation.', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser QA project' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('tablet and mobile member routes remain usable without horizontal overflow', async ({
  page,
}) => {
  await demo(page);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      '/app',
      '/app/library',
      '/app/build',
      '/app/community',
      '/app/account',
      '/app/workspace',
      '/app/foundry',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.loading-state')).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${path} at ${width}px`).toBe(false);
    }
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('link', { name: 'Overview', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
});
test('public mobile layout, empty results, and provider configuration states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  await page
    .getByRole('link', { name: 'Find your membership', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Join Operator', exact: true }),
  ).toBeVisible();
  await demo(page);
  await page.goto('/app/library?q=no-such-system-xyz');
  await expect(
    page.getByRole('heading', { name: 'No resources found.' }),
  ).toBeVisible();
  await page.goto('/app/account');
  await expect(
    page.getByText('Payments are not connected in this environment.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Payments not connected' }).first(),
  ).toBeDisabled();
});

test('scoped mentions notify their recipient and report dialogs support keyboard dismissal', async ({
  page,
  browser,
}) => {
  await demo(page);
  await page.goto('/app/community?room=ai-systems');
  await page.getByRole('button', { name: 'Mention a member' }).click();
  await page
    .locator('.mention-picker')
    .getByRole('button', { name: 'Alex Morgan' })
    .click();
  const composer = page.getByLabel('Message AI Systems');
  await expect(composer).toHaveValue('@Alex Morgan ');
  await composer.fill('@Alex Morgan browser QA mention delivery.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const message = page
    .locator('.message')
    .filter({ hasText: '@Alex Morgan browser QA mention delivery.' });
  await expect(message).toBeVisible();
  await message
    .getByRole('button', { name: 'Report message from Jordan Lee' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Report this message' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const admin = await browser.newContext();
  try {
    const login = await admin.request.post(
      'http://127.0.0.1:5174/api/auth/demo',
      { headers: { origin: 'http://127.0.0.1:5174' }, data: { role: 'admin' } },
    );
    expect(login.ok()).toBe(true);
    const notifications = await (
      await admin.request.get('http://127.0.0.1:5174/api/notifications')
    ).json();
    expect(
      notifications.notifications.some((n: { title: string; body: string }) =>
        /mention/i.test(n.title + ' ' + n.body),
      ),
    ).toBe(true);
  } finally {
    await admin.close();
  }
});
