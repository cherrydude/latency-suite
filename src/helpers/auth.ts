import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUTH_STATE_PATH = path.resolve(__dirname, '../auth/.auth-state.json');

type Cookie = { name: string; expires: number; domain?: string };

export function isLoginValid(): boolean {
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf-8'));
    const nowSec = Date.now() / 1000;
    // WHY filter on name+domain+expiry together: a SESSION cookie scoped to
    // some other domain in storageState would falsely satisfy a name-only check.
    const session = (state.cookies as Cookie[] | undefined)?.find(c => {
      const name   = (c.name || '').toUpperCase();
      const domain = (c.domain || '').replace(/^\./, '').toLowerCase();
      const isAppDomain = domain === 'hilex.sruv.de' || domain.endsWith('.hilex.sruv.de');
      // WHY only `expires === -1`: Playwright uses -1 for session cookies.
      // The review noted there's no documented case where `expires === 0`
      // appears in storageState — dropping it avoids accepting a stale cookie.
      const notExpired = c.expires === -1 || c.expires > nowSec;
      return (name === 'SESSION' || name === 'JSESSIONID') && isAppDomain && notExpired;
    });
    return Boolean(session);
  } catch {
    return false;
  }
}
