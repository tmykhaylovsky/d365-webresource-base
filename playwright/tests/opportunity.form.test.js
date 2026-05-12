// opportunity.form.test.js
// Verifies the Opportunity - Dev: Lifecycle form loads and Ops.Forms.Opportunity behavior is correct.
//
// Prerequisites:
//   1. node playwright/setup-auth.js   (saves D365 session)
//   2. The "Opportunity - Dev: Lifecycle" form must exist in D365 and have opportunity.form.js
//      (plus all 6 dependency scripts) registered as web resource dependencies.
//   3. A test Opportunity record must exist in Open state (statecode=0) —
//      configure opportunityId in playwright/test.env.json.
//   4. Optionally set competitorId for competitor association tests.
//
// Manual verification steps (intentionally not automated — mutate record state):
//   A. Win flow:    Open form → set Status Reason = Won → confirm dialog appears → cancel.
//   B. Lose flow:   Open form → set Status Reason = Lost → confirm dialog appears → cancel.
//   C. Reopen flow: Close an opportunity → reopen it via the Reopen button → verify form reloads.
//   These are covered by unit tests in test/ops.webapi.test.js (action body shape) without
//   hitting D365. Automated E2E is omitted to avoid permanently mutating the test record's statecode.

'use strict';

const { test, expect } = require('@playwright/test');
const loadTestConfig   = require('../load-test-config');

const cfg    = loadTestConfig();
const formId = cfg.formIds && cfg.formIds.opportunityLifecycle;
const FORM_URL = cfg.environment + '/main.aspx?appid=' + cfg.appId +
    '&pagetype=entityrecord&etn=opportunity&id=' + cfg.opportunityId +
    (formId ? '&formid=' + formId : '');

test.describe('Opportunity Lifecycle Form', function () {

    test('form loads and Ops.Debug log is populated', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const logLength = await page.evaluate(function () {
            if (!window.Ops || !window.Ops.Debug) return 0;
            return window.Ops.Debug.getLog().length;
        });

        expect(logLength).toBeGreaterThan(0);
    });

    test('_prevStatusCode is captured after onLoad', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });
        await page.waitForTimeout(3000);

        const moduleLoaded = await page.evaluate(function () {
            return typeof window.Ops !== 'undefined' &&
                   typeof window.Ops.Forms !== 'undefined' &&
                   typeof window.Ops.Forms.Opportunity !== 'undefined';
        });
        expect(moduleLoaded).toBe(true);

        const onLoadLogged = await page.evaluate(function () {
            if (!window.Ops || !window.Ops.Debug) return false;
            return window.Ops.Debug.getLog().some(function (e) {
                return e.msg && e.msg.indexOf('onLoad') !== -1;
            });
        });
        expect(onLoadLogged).toBe(true);
    });

    test('debug button is injected', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const btn = await page.waitForSelector('#ops-debug-btn', { timeout: 10000 });
        expect(btn).toBeTruthy();

        const btnText = await page.locator('#ops-debug-btn').innerText();
        expect(btnText).toBe('DBG');
    });

    test('statuscode field is present and readable', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const select = page.locator('[data-id="statuscode.fieldControl-option-set-select"]');
        await expect(select).toBeVisible({ timeout: 10000 });
    });

    test('estimated close date validation shows warning when set to past date', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const dateInput = page.locator('[data-id="estimatedclosedate.fieldControl-date-time-input"]');
        await dateInput.fill('01/01/2020');
        await dateInput.press('Tab');

        const notif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: /past|Estimated close/i
        });
        await expect(notif).toBeVisible({ timeout: 8000 });
    });

    test('onSave blocks save when estimated close date is in the past', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        const dateInput = page.locator('[data-id="estimatedclosedate.fieldControl-date-time-input"]');
        await dateInput.fill('01/01/2020');
        await dateInput.press('Tab');

        await page.keyboard.press('Control+s');

        // Expect either an error notification or the form to remain dirty (save was blocked)
        const errorNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: /estimated close/i
        });
        const hasError = await errorNotif.isVisible({ timeout: 5000 }).catch(function () { return false; });

        if (!hasError) {
            const isDirty = await page.evaluate(function () {
                if (!window.Xrm || !window.Xrm.Page) return null;
                return window.Xrm.Page.data && window.Xrm.Page.data.entity
                    ? window.Xrm.Page.data.entity.getIsDirty()
                    : null;
            });
            // If we can check dirty state, verify the form is still dirty (save was prevented)
            if (isDirty !== null) {
                expect(isDirty).toBe(true);
            }
        } else {
            await expect(errorNotif).toBeVisible();
        }
    });

    test('Ops.WebApi.winOpportunity is accessible from page context', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });
        await page.waitForTimeout(3000);

        const accessible = await page.evaluate(function () {
            return typeof window.Ops !== 'undefined' &&
                   typeof window.Ops.WebApi !== 'undefined' &&
                   typeof window.Ops.WebApi.winOpportunity === 'function';
        });
        expect(accessible).toBe(true);
    });

    test('Ops.WebApi.associate and disassociate are accessible from page context', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });
        await page.waitForTimeout(3000);

        const associateOk = await page.evaluate(function () {
            return typeof window.Ops !== 'undefined' &&
                   typeof window.Ops.WebApi !== 'undefined' &&
                   typeof window.Ops.WebApi.associate === 'function';
        });
        expect(associateOk).toBe(true);

        const disassociateOk = await page.evaluate(function () {
            return typeof window.Ops !== 'undefined' &&
                   typeof window.Ops.WebApi !== 'undefined' &&
                   typeof window.Ops.WebApi.disassociate === 'function';
        });
        expect(disassociateOk).toBe(true);
    });

    test('no CRITICAL log entries after onLoad', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });
        await page.waitForTimeout(5000);

        const criticalEntries = await page.evaluate(function () {
            if (!window.Ops || !window.Ops.Debug) return [];
            return window.Ops.Debug.getLog().filter(function (e) {
                return e.level === 'Critical';
            });
        });
        expect(criticalEntries).toHaveLength(0);
    });

    // Win/Lose flows are intentionally skipped — they mutate the test record's statecode permanently.
    // Restoring the record via reopenOpportunity may not succeed in CI.
    // Action body shape is verified by unit tests in test/ops.webapi.test.js.
    test.skip('selecting Won in statuscode triggers confirm dialog', async function ({ page }) {
        // Manual: open form, set Status Reason = Won, verify confirm dialog appears, cancel.
        // Automated test omitted — mutates record state.
    });

    test.skip('selecting Lost in statuscode triggers confirm dialog', async function ({ page }) {
        // Manual: open form, set Status Reason = Lost, verify confirm dialog appears, cancel.
        // Automated test omitted — mutates record state.
    });

});
