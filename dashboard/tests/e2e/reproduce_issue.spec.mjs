import { test, expect, devices } from '@playwright/test';
import { DashboardHarness } from './harness.mjs';

const DASHBOARD_PORT = 19114;
const BACKEND_PORT = 18104;
const PUBLIC_PORT = 17104;

const harness = new DashboardHarness({
  dashboardPort: DASHBOARD_PORT,
  backendPort: BACKEND_PORT,
  publicPort: PUBLIC_PORT,
});

test.use({
  ...devices['iPhone 13'],
});

test.beforeAll(async () => {
  await harness.setup('Repro');
});

test.afterAll(async () => {
  await harness.teardown();
});

test('verify scrolling and page jump issues on mobile', async ({ page }) => {
  // 1. Navigate to the dashboard
  await page.goto(`http://127.0.0.1:${DASHBOARD_PORT}`);
  await page.waitForSelector('.session.tap');

  // Initial scroll position check
  let scrollY = await page.evaluate(() => window.scrollY);
  console.log('Initial window.scrollY:', scrollY);
  expect(scrollY).toBe(0);

  // 2. Click on a session card to open the "Start Session" modal
  await page.click('.session.tap');
  await page.waitForSelector('#intent-modal.open');

  // Check scroll position after opening modal
  scrollY = await page.evaluate(() => window.scrollY);
  console.log('window.scrollY after opening modal:', scrollY);
  expect(scrollY, 'Page should not scroll when opening modal').toBe(0);

  // 3. Navigate the provider carousel
  await page.click('#provider-next');
  await page.waitForTimeout(300); // Wait for potential layout shifts/jumps
  scrollY = await page.evaluate(() => window.scrollY);
  console.log('window.scrollY after clicking provider-next:', scrollY);
  expect(scrollY, 'Page should not scroll when navigating provider carousel').toBe(0);

  await page.click('#provider-prev');
  await page.waitForTimeout(300);
  scrollY = await page.evaluate(() => window.scrollY);
  console.log('window.scrollY after clicking provider-prev:', scrollY);
  expect(scrollY, 'Page should not scroll when navigating provider carousel back').toBe(0);

  // 4. Click the "Start Session" button
  // Note: modal closes immediately on click in the implementation
  await page.click('#intent-confirm');
  
  await page.waitForSelector('#intent-modal', { state: 'hidden' });
  
  scrollY = await page.evaluate(() => window.scrollY);
  console.log('window.scrollY after clicking Start session:', scrollY);
  expect(scrollY, 'Page should not scroll when clicking Start session').toBe(0);
});
