import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DashboardHarness, waitFor } from './harness.mjs';

const DASHBOARD_PORT = 19112;
const BACKEND_PORT = 18102;
const PUBLIC_PORT = 17102;

const harness = new DashboardHarness({
  dashboardPort: DASHBOARD_PORT,
  backendPort: BACKEND_PORT,
  publicPort: PUBLIC_PORT,
});

test.beforeAll(async () => {
  await harness.setup('Feynman');
});

test.afterAll(async () => {
  await harness.teardown();
});

test('Chat UI Refactor', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await harness.spawnAndWaitForBackend();
  await page.goto(`http://127.0.0.1:${DASHBOARD_PORT}`);

  // 1. Sidebar should list the session
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
  
  const sidebarItem = sidebar.locator('.sidebar-item').filter({ hasText: harness.slotName });
  await expect(sidebarItem).toBeVisible();

  // 2. Main chat area should be visible
  const chatArea = page.locator('.chat-area');
  await expect(chatArea).toBeVisible();

  // 3. Selecting a session should load it
  await sidebarItem.click();
  await expect(page.locator('.chat-header-title')).toContainText(harness.slotName);

  // 4. Inject mock events and verify rendering
  const userEvent = {
    ts: new Date().toISOString(),
    eventType: 'UserPromptSubmit',
    payload: { value: 'What is 2+2?' }
  };
  const assistantEvent = {
    ts: new Date().toISOString(),
    eventType: 'Stop',
    payload: { value: '2+2 is 4.' }
  };
  
  await fs.appendFile(harness.eventsFile, JSON.stringify(userEvent) + '\n');
  await fs.appendFile(harness.eventsFile, JSON.stringify(assistantEvent) + '\n');

  // Verify user message
  await expect(page.locator('.message.user')).toContainText('What is 2+2?');
  // Verify assistant message
  await expect(page.locator('.message.assistant')).toContainText('2+2 is 4.');

  // 5. Test input bar
  const input = page.locator('.chat-input');
  await expect(input).toBeVisible();
  await input.fill('ping');
  await input.press('Enter');

  await expect(input).toHaveValue('');
});

test('Mobile responsiveness', async ({ page }) => {
  // Set viewport to iPhone 13 Pro size
  await page.setViewportSize({ width: 390, height: 844 });
  await harness.spawnAndWaitForBackend();
  await page.goto(`http://127.0.0.1:${DASHBOARD_PORT}`);

  const container = page.locator('#app-container');
  const sidebar = page.locator('.sidebar');
  const toggleBtn = page.locator('#sidebar-toggle-in-chat');
  
  // 1. Sidebar should be hidden initially on mobile
  await expect(container).not.toHaveClass(/sidebar-open/);

  // 2. Click toggle to open
  await toggleBtn.click();
  await expect(container).toHaveClass(/sidebar-open/);

  // 3. Select a session - sidebar should auto-close
  const sidebarItem = sidebar.locator('.sidebar-item').filter({ hasText: harness.slotName });
  await sidebarItem.click();
  
  await expect(container).not.toHaveClass(/sidebar-open/);
  await expect(page.locator('.chat-header-title')).toContainText(harness.slotName);
});
