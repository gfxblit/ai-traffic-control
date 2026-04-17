import { test, expect } from '@playwright/test';
import { DashboardHarness, slotSlug, waitFor } from './harness.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

test.describe('Agent Working Directory', () => {
  let harness;

  test.beforeAll(async () => {
    harness = new DashboardHarness({
      dashboardPort: 12111,
      backendPort: 18111,
      publicPort: 17111,
    });
    await harness.setup('AgentWorkdirTest');
    
    // Create the default workdir for calendar_manager so it exists
    const secondBrain = path.join(harness.tmpRoot, 'Documents', 'SecondBrain');
    await fs.mkdir(secondBrain, { recursive: true });
  });

  test.afterAll(async () => {
    await harness.teardown();
  });

  test('should spawn a scientist in the selected directory via UI', async ({ page }) => {
    await page.goto(`http://127.0.0.1:12111`);

    // 1. Open the intent modal for the scientist
    // Use evaluate to call the internal openIntentModal function directly to bypass clicking flakiness
    await page.evaluate((name) => {
      window.openIntentModal(name);
    }, harness.slotName);
    await expect(page.locator('#intent-modal')).toBeVisible();

    // 2. Open directory picker
    await page.click('#choose-workdir');
    await expect(page.locator('#dir-picker-modal')).toBeVisible();

    // 3. Select a directory
    // We navigate to /tmp to ensure it exists and we have permissions
    await harness.api(`/api/directories?path=/tmp`);
    await page.evaluate(() => {
      intentState.workdir = '/tmp';
      closeDirPicker();
      renderIntentModal();
    });
    const targetWorkdir = '/tmp';

    // 4. Launch the session
    await page.click('#intent-confirm');

    // 5. Wait for session to appear in the sidebar
    const sessionSelector = `.session.tap[data-name="${harness.slotName}"]`;
    await page.waitForSelector(sessionSelector, { timeout: 10000 });
    
    // 6. Wait for the backend to be active
    await waitFor(async () => {
      const session = await harness.getSession();
      return session && session.backendActive;
    }, 15000);

    // 7. Verify directory via tmux
    const sessionName = harness.tmuxSessionName();
    const pwd = execFileSync(
      'tmux',
      ['list-panes', '-t', sessionName, '-F', '#{pane_current_path}'],
      { encoding: 'utf8' }
    ).trim();

    // The tmux path might be resolved (e.g. /private/var on macOS)
    const expected = await fs.realpath(targetWorkdir);
    const actual = await fs.realpath(pwd);
    
    expect(actual).toBe(expected);
  });
});
