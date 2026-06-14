import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

const authDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
dotenv.config({ path: path.resolve(authDir, '../config/server.env') });

const PORTAL_LOGIN_URL = process.env.PORTAL_LOGIN_URL;
const PORTAL_LOGIN_USERNAME = process.env.PORTAL_LOGIN_USERNAME || process.env.LOGIN_USERNAME;
const PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || process.env.LOGIN_PASSWORD;
const PORTAL_AUTH_STATE_PATH = path.resolve(authDir, '.portal-auth-state.json');

console.log('Loaded portal environment variables:', { PORTAL_LOGIN_URL, PORTAL_LOGIN_USERNAME });

(async () => {
  if (!PORTAL_LOGIN_URL || !PORTAL_LOGIN_USERNAME || !PORTAL_LOGIN_PASSWORD) {
    console.error('Missing environment variables: PORTAL_LOGIN_URL and credentials (PORTAL_LOGIN_* or LOGIN_*)');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to portal login page...');
    await page.goto(PORTAL_LOGIN_URL);

    console.log('Filling in portal email address...');
    await page.fill('input.q-field__native[placeholder*="email"]', PORTAL_LOGIN_USERNAME);

    const continueButton = page.locator('button', { hasText: 'Continue' });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      await page.waitForTimeout(1500);
    }

    console.log('Waiting for portal password field...');
    const passwordInput = page.locator('input[placeholder="Please insert password..."]');
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });

    console.log('Filling in portal password...');
    await page.evaluate((pwd) => {
      const input = document.querySelector('input[placeholder="Please insert password..."]');
      if (input instanceof HTMLInputElement) {
        input.value = pwd;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, PORTAL_LOGIN_PASSWORD);

    const loginButton = page.locator('button:has-text("Login")');
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await page.waitForTimeout(2000);
    }

    console.log('Saving portal authentication state...');
    const storageState = await context.storageState();
    fs.writeFileSync(PORTAL_AUTH_STATE_PATH, JSON.stringify(storageState));

    console.log('Portal login successful. State saved to:', PORTAL_AUTH_STATE_PATH);
  } catch (error) {
    console.error('Portal login failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
