import type { Page } from '@playwright/test';

export const dismissToast = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const toast = document.getElementById('toast');
    if (toast) toast.hidden = true;
  });
};

export const filterOnlineCard = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const input = document.getElementById('subject-search') as HTMLInputElement;
    input.value = 'MPU';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.agenda-events .lesson').first().waitFor();
};
