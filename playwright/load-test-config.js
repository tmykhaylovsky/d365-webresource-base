// playwright/load-test-config.js
// Reads playwright/test.env.json (gitignored) — copy test.env.example.json to get started.
// Used by playwright.config.js, setup-auth.js, and test files.

'use strict';

const fs   = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, 'test.env.json');

function loadTestConfig() {
    if (!fs.existsSync(ENV_PATH)) {
        throw new Error(
            'playwright/test.env.json not found.\n' +
            'Copy playwright/test.env.example.json → playwright/test.env.json and fill in your environment.'
        );
    }
    return JSON.parse(fs.readFileSync(ENV_PATH, 'utf8'));
}

module.exports = loadTestConfig;
