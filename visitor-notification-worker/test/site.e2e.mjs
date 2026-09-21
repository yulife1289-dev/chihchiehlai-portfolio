import { expect, test } from '@playwright/test';

const workerEndpoint = '**/visit';

async function stubNotificationWorker(page, result = { status: 202 }) {
  await page.route(workerEndpoint, async (route) => {
    await route.fulfill({ status: result.status, contentType: 'application/json', body: '{}' });
  });
}

test('projects, a project detail, and resume render with one per-tab notification attempt', async ({ page }) => {
  let visitRequests = 0;
  await stubNotificationWorker(page);
  page.on('request', (request) => {
    if (request.url().includes('portfolio-visit-notify') && request.method() === 'POST') visitRequests += 1;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#projects');
  await expect(page.locator('.project-card').first()).toBeVisible();
  await expect(page.locator('.project-card')).toHaveCount(15);
  await expect(page).toHaveTitle(/Portfolio/);

  await page.goto('/#project/tianmu-ye');
  await expect(page.locator('.detail-hero')).toBeVisible();
  await page.goto('/#resume');
  await expect(page.locator('.resume-hero')).toBeVisible();
  await page.reload();
  await expect(page.locator('.resume-hero')).toBeVisible();
  expect(visitRequests).toBe(1);
});

test('mobile layout has no horizontal overflow and a notification failure does not break rendering', async ({ page }) => {
  await page.route(workerEndpoint, async (route) => route.abort('failed'));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#projects');
  await expect(page.locator('.project-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/#project/tianmu-ye');
  await expect(page.locator('.detail-hero')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/#resume');
  await expect(page.locator('.resume-hero')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
