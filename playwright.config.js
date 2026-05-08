// playwright.config.js
// Playwright configuration for D365 form tests.
//
// First-time auth setup:
//   node playwright/setup-auth.js
// This opens a browser, you log in to D365, and the session is saved to
// playwright/.auth/state.json (gitignored). All tests reuse that session.
//
// Environment setup:
//   Copy playwright/test.env.example.json → playwright/test.env.json
//   Fill in your D365 environment URL, app ID, and test record IDs.
//
// Run tests:
//   npx playwright test
//   npx playwright test --headed          # see the browser
//   npx playwright test --ui              # Playwright UI mode

'use strict';

const { defineConfig, devices } = require('@playwright/test');
const loadTestConfig             = require('./playwright/load-test-config');

let baseURL = 'https://{tenant}.crm.dynamics.com';
try {
    baseURL = loadTestConfig().environment;
} catch (e) {
    console.warn('[playwright.config] ' + e.message);
}

module.exports = defineConfig({
    testDir:  './playwright/tests',
    timeout:  30000,
    retries:  1,

    use: {
        baseURL:      baseURL,
        storageState: 'playwright/.auth/state.json',
        headless:     true,
        viewport:     { width: 1440, height: 900 },
        screenshot:   'only-on-failure',
        video:        'retain-on-failure'
    },

    projects: [
        {
            name: 'chromium',
            use:  { ...devices['Desktop Chrome'] }
        }
    ],

    // globalSetup runs once before all tests — skipped if state.json already exists
    // globalSetup: './playwright/setup-auth.js'
});
