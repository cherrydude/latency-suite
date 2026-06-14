import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isLoginValid } from './auth';

//const LOGIN_SCRIPT = '/usr/src/app/src/auth/login.js';
const LOGIN_SCRIPT = './../auth/login.js';

// WHY a function (not top-level execSync): runs once per test run, before
// workers fork. No race on the auth-state file, no repeated logins.
export default async function globalSetup(): Promise<void> {
  // WHY skip when the login script is absent: the demo/TodoMVC path of this
  // example runs against a public SPA with no auth. We want `npx playwright
  // test` to work in a fresh checkout without erroring on a missing
  // login.js. Production HighQ runs ship the script and exercise this path.
  if (!existsSync(LOGIN_SCRIPT)) {
    console.log(`[global-setup] login script not found at ${LOGIN_SCRIPT} — skipping auth bootstrap.`);
    return;
  }

  if (!isLoginValid()) {
    // WHY stdio: 'inherit': makes the auth bootstrap visible in CI logs
    // without polluting per-test stdout streams.
    execSync(`node ${LOGIN_SCRIPT}`, { stdio: 'inherit' });
  }
}