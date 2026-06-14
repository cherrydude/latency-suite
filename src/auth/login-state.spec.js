import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '../config/server.env' });

const LOGIN_URL = 'https://auth.thomsonreuters.com/u/login/identifier?state=hKFo2SBzRUUxejd4NVpfSXQ4NGRMdzlndmw2dWZUMWM1VWZESKFur3VuaXZlcnNhbC1sb2dpbqN0aWTZIExHRnkySDU5VDlDWGlkSmFpTUF1aWsyUkVRcDZNVWdXo2NpZNkgZWVsbWhMWVpmcEZOVDdvekd3aFRvVzRGYXBXVDV6TGg';
const LOGIN_USERNAME = process.env.LOGIN_USERNAME;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const AUTH_STATE_PATH = './.auth-state.json';

// Playwright-Test: Login und State speichern
// Zugangsdaten per Umgebungsvariable setzen

test('Login und State speichern', async ({ page }) => {
  await page.goto(LOGIN_URL);
  await page.fill('#username', LOGIN_USERNAME);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#password', { timeout: 15000 });
  await page.fill('#password', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  // Nach Login auf Zielseite gehen, damit alle Auth-Cookies gesetzt werden
  await page.goto('https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=6&metaData.sheetViewID=14&isDraftView=0');
  // Login-State speichern
  const state = await page.context().storageState();
  const dir = path.dirname(AUTH_STATE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state));
  console.log('Login-State gespeichert:', AUTH_STATE_PATH);
});
