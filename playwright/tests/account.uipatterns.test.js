// account.uipatterns.test.js
// Verifies the Account - Dev: UI Patterns form: notifications, field states, onSave guard.

'use strict';

const { test, expect } = require('@playwright/test');
const loadTestConfig   = require('../load-test-config');

const cfg      = loadTestConfig();
const ENV      = cfg.environment;
const formId   = cfg.formIds.accountUiPatterns;
const FORM_URL = ENV + '/main.aspx?appid=' + cfg.appId +
    '&pagetype=entityrecord&etn=account&id=' + cfg.accountId +
    (formId ? '&formid=' + formId : '');

test.describe('Account UI Patterns Form', function () {

    test('form loads and timed info notification appears', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // The timed notification set in _demoNotifications should appear shortly after load
        const infoNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: 'UI Patterns form loaded'
        });
        await expect(infoNotif).toBeVisible({ timeout: 15000 });
    });

    test('timed notification auto-clears after 4 seconds', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const infoNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: 'UI Patterns form loaded'
        });
        await expect(infoNotif).toBeVisible({ timeout: 15000 });

        // Wait for auto-clear (4s delay + buffer)
        await page.waitForTimeout(5500);
        await expect(infoNotif).not.toBeVisible();
    });

    test('onSave blocks save when Name is empty', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // Clear the Name field
        const nameField = page.locator('[data-id="name.fieldControl-text-box-text"]');
        await nameField.clear();
        await nameField.blur();

        // Trigger save via keyboard shortcut
        await page.keyboard.press('Control+S');

        // Validation error notification should appear
        const errorNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: 'Account name is required'
        });
        await expect(errorNotif).toBeVisible({ timeout: 5000 });
    });

    test('Name onChange shows validation error then clears when corrected', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // Clear name to trigger validation
        const nameField = page.locator('[data-id="name.fieldControl-text-box-text"]');
        await nameField.clear();
        await nameField.blur();

        const errorNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: 'Account name cannot be empty'
        });
        await expect(errorNotif).toBeVisible({ timeout: 5000 });

        // Restore name to clear the notification
        await nameField.fill('Restored Account Name');
        await nameField.blur();
        await expect(errorNotif).not.toBeVisible({ timeout: 3000 });
    });

    test('Ops.Debug button is injected into the page DOM', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const debugBtn = page.locator('#ops-debug-btn');
        await expect(debugBtn).toBeAttached({ timeout: 10000 });
        await expect(debugBtn).toHaveText('DBG');
    });

    test('Ops.Debug log is accessible from page context', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // Allow time for onLoad to complete
        await page.waitForTimeout(3000);

        const logLength = await page.evaluate(function () {
            return window.Ops && window.Ops.Debug ? window.Ops.Debug.getLog().length : -1;
        });

        expect(logLength).toBeGreaterThan(0);
    });
});
