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

export type SettingsOption = 'Open timetable file' | 'Accessibility preferences' | 'Timetable information and status';

export const openSettings = async (page: Page, option: SettingsOption): Promise<void> => {
  await page.locator('#settings-button').click();
  await page.getByRole('button', { name: option, exact: true }).click();
};
