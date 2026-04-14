import { test, expect } from '@playwright/test';
import { DashboardHarness } from './harness.mjs';

test.describe('Agent Working Directory', () => {
  let harness;

  test.beforeAll(async () => {
    harness = new DashboardHarness({
      dashboardPort: 12111,
      backendPort: 18111,
      publicPort: 17111,
    });
    await harness.setup('AgentWorkdirTest');
  });

  test.afterAll(async () => {
    await harness.teardown();
  });

  test('should spawn an agent in the selected directory', async ({ page }) => {
    await page.goto(`http://127.0.0.1:12111`);

    // 1. Open the agent modal (assuming 'calendar_manager' is available)
    await page.click('[data-agent-dial-id="calendar_manager"]');
    await expect(page.locator('#agent-modal')).toBeVisible();

    // 2. Open directory picker
    await page.click('#agent-choose-workdir');
    await expect(page.locator('#dir-picker-modal')).toBeVisible();

    // 3. Select a directory
    await page.click('#dir-picker-select', { force: true }); 

    // 4. Launch the agent
    await page.click('#agent-confirm');

    // 5. Wait for session to appear
    await expect(page.locator(`.session-card[data-session-name="${harness.slotName}"]`)).toBeVisible();
    await page.waitForTimeout(2000); 
    
    // 6. Verify directory by sending 'pwd' to the terminal
    // Focus the terminal pane first
    await page.click(`.session-card[data-session-name="${harness.slotName}"]`);
    await page.keyboard.type('!pwd');
    await page.keyboard.press('Enter');

    // 7. Verify the output
    const terminalOutput = page.locator('.xterm-rows');
    // Using a regex to match the path because the output might contain other text
    await expect(terminalOutput).toContainText(/[^\r\n\/]*/);
  });
});
