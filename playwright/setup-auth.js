// playwright/setup-auth.js
// One-time interactive login. Saves session cookies to playwright/.auth/state.json.
// Run this once before running tests; re-run when the session expires (~8 hours for D365).
//
// Usage:
//   node playwright/setup-auth.js
//
// What it does:
//   1. Opens a Chromium window and navigates to your D365 environment
//   2. Waits for you to log in (including MFA if required)
//   3. Detects when D365 has loaded (looks for the nav bar)
//   4. Saves the session state and closes the browser
//
// The saved state is loaded by every Playwright test via storageState in playwright.config.js.

'use strict';

const { chromium }   = require('@playwright/test');
const path           = require('path');
const fs             = require('fs');
const loadTestConfig = require('./load-test-config');

const cfg        = loadTestConfig();
const ENV_URL    = cfg.environment;
const STATE_PATH = path.join(__dirname, '.auth', 'state.json');
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes to complete login

async function main() {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page    = await context.newPage();

    console.log('[setup-auth] Opening browser — please log in to D365...');
    await page.goto(ENV_URL);

    try {
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: TIMEOUT_MS });
        console.log('[setup-auth] D365 shell detected — saving session state...');
    } catch {
        console.error('[setup-auth] Timed out waiting for D365 to load. Did you complete login within 3 minutes?');
        await browser.close();
        process.exit(1);
    }

    // Extra wait for any post-login redirects to settle
    await page.waitForTimeout(2000);

    await context.storageState({ path: STATE_PATH });
    console.log('[setup-auth] Session saved to ' + STATE_PATH);
    console.log('[setup-auth] Run "npx playwright test" to execute tests.');

    await browser.close();
}

main().catch(function (err) {
    console.error('[setup-auth] Fatal: ' + err.message);
    process.exit(1);
});
