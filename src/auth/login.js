import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '../config/server.env') });

const LOGIN_URL = process.env.LOGIN_URL;
const LOGIN_USERNAME = process.env.LOGIN_USERNAME;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const AUTH_STATE_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '.auth-state.json');
const APP_URL = 'https://hilex.sruv.de/soep/dashboard.action?fromLogin=true';

console.log('Loaded environment variables:', {
  LOGIN_URL,
  LOGIN_USERNAME,
  LOGIN_PASSWORD: LOGIN_PASSWORD ? '***' : undefined,
});

function hasValidAppCookie(cookies) {
  const nowSeconds = Date.now() / 1000;
  return cookies.some((cookie) => {
    const name = (cookie.name || '').toLowerCase();
    const domain = (cookie.domain || '').replace(/^\./, '').toLowerCase();
    const isAppDomain = domain === 'hilex.sruv.de' || domain.endsWith('.hilex.sruv.de');
    const notExpired = cookie.expires === -1 || cookie.expires === 0 || cookie.expires > nowSeconds;
    const looksLikeSession =
      name === 'session' ||
      name === 'jsessionid' ||
      name.includes('sess') ||
      name.includes('token');
    return isAppDomain && notExpired && looksLikeSession;
  });
}

async function clickIfVisible(page, selector) {
  const locator = page.locator(selector).first();
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    if (await clickIfVisible(page, selector)) {
      return selector;
    }
  }
  return null;
}

async function waitForAny(page, tasks) {
  const wrappedTasks = tasks.map((task) => task.catch(() => null));
  const result = await Promise.race(wrappedTasks);
  return result || null;
}

async function isAppAccessUsable(context, page) {
  const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  const currentUrl = page.url();
  const inApp = /https:\/\/hilex\.sruv\.de\/soep/i.test(currentUrl);
  const stillOnIdp = /auth\.thomsonreuters\.com/i.test(currentUrl);
  const status = response ? response.status() : null;
  return {
    ok: Boolean(inApp && !stillOnIdp && status !== 401 && status !== 403),
    currentUrl,
    status,
  };
}

(async () => {
  if (!LOGIN_URL || !LOGIN_USERNAME || !LOGIN_PASSWORD) {
    console.error('Missing environment variables: LOGIN_URL, LOGIN_USERNAME, LOGIN_PASSWORD');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const usernameField = page.locator('#username').first();
    if (await usernameField.isVisible().catch(() => false)) {
      console.log('Filling in email address...');
      await usernameField.fill(LOGIN_USERNAME);
      const usernameSubmitSelector = await clickFirstVisible(page, [
        'button._button-login-id',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Weiter")',
        'button:has-text("Next")',
      ]);
      if (!usernameSubmitSelector) {
        await usernameField.press('Enter').catch(() => null);
      }
    }

    const passwordField = page.locator('#password').first();
    let reachedApp = /https:\/\/hilex\.sruv\.de\/soep/i.test(page.url());
    if (!reachedApp) {
      console.log('Waiting for password field or app redirect...');
      const nextStep = await waitForAny(page, [
        page.waitForSelector('#password', { timeout: 20000 }).then(() => 'password').catch(() => null),
        page.waitForURL(/hilex\.sruv\.de\/soep/i, { timeout: 20000 }).then(() => 'app').catch(() => null),
      ]);
      reachedApp = nextStep === 'app' || /https:\/\/hilex\.sruv\.de\/soep/i.test(page.url());
    }

    if (!reachedApp && await passwordField.isVisible().catch(() => false)) {
      console.log('Filling in password...');
      await passwordField.fill(LOGIN_PASSWORD);
      const passwordSubmitSelector = await clickFirstVisible(page, [
        'button._button-login-password',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Weiter")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
      ]);
      if (!passwordSubmitSelector) {
        await passwordField.press('Enter').catch(() => null);
      }
    }

    // Some IdPs show an extra consent/continue screen after password.
    await clickFirstVisible(page, [
      'button:has-text("Continue")',
      'button:has-text("Allow")',
      'button:has-text("Accept")',
      'button:has-text("Weiter")',
      'button:has-text("Zulassen")',
      'button:has-text("Anmelden")',
    ]);

    console.log('Waiting for successful login...');
    await waitForAny(page, [
      page.waitForURL(/hilex\.sruv\.de\/soep/i, { timeout: 45000 }),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
    ]);

    const cookies = await context.cookies();
    const appCookiePresent = hasValidAppCookie(cookies);
    const appCheck = await isAppAccessUsable(context, page);

    if (!appCheck.ok) {
      throw new Error(
        `Login state invalid. URL: ${appCheck.currentUrl}; status=${appCheck.status}; appCookiePresent=${appCookiePresent}`
      );
    }

    console.log('Saving authentication state...');
    const storageState = await context.storageState();
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(storageState));

    console.log('Login successful. State saved to:', AUTH_STATE_PATH);
  } catch (error) {
    console.error('Login failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();