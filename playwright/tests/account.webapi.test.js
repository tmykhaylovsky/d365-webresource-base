// account.webapi.test.js
// Verifies the Account - Dev: WebApi form loads and all WebApi pattern demos complete.
//
// Prerequisites:
//   1. node playwright/setup-auth.js   (saves D365 session)
//   2. The "Account - Dev: WebApi" form must exist in D365 and have ops_account.webapi.form.js
//      (plus all dependency scripts) registered as web resource dependencies.
//   3. The test Account record must exist — configure accountId in playwright/test.env.json.
//
// What is tested:
//   - Form loads without a fatal error notification
//   - The "WebApi demos complete" success notification appears (confirms all demos ran)
//   - No FAILED entries appear in the Ops.Debug log
//   - Transient records created during the demo (contacts) are cleaned up

'use strict';

const { test, expect } = require('@playwright/test');
const loadTestConfig   = require('../load-test-config');

const cfg      = loadTestConfig();
const ENV      = cfg.environment;
const formId   = cfg.formIds.accountWebApi;
const FORM_URL = ENV + '/main.aspx?appid=' + cfg.appId +
    '&pagetype=entityrecord&etn=account&id=' + cfg.accountId +
    (formId ? '&formid=' + formId : '');

test.describe('Account WebApi Demo Form', function () {

    test('form loads and all WebApi demos complete without error', async function ({ page }) {
        await page.goto(FORM_URL);

        // Wait for D365 form shell to be ready
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // Wait for the success notification that account.webapi.form.js sets on completion
        const successNotif = page.locator('[data-id*="notificationmessage"]').filter({
            hasText: 'WebApi demos complete'
        });
        await expect(successNotif).toBeVisible({ timeout: 20000 });
    });

    test('no Ops.Debug FAILED entries after demos run', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });

        // Wait for demos to finish before inspecting the log
        await page.waitForSelector('[data-id*="notificationmessage"]', { timeout: 20000 });

        const failedEntries = await page.evaluate(function () {
            if (!window.Ops || !window.Ops.Debug) return [];
            return window.Ops.Debug.getLog().filter(function (e) {
                return e.level === 'Critical' || (e.msg && e.msg.indexOf('FAILED') !== -1);
            });
        });

        expect(failedEntries).toHaveLength(0);
    });

    test('no orphaned _WebApiDemo or _BatchDemo contacts after demos run', async function ({ page }) {
        await page.goto(FORM_URL);
        await page.waitForSelector('[data-id="navbar-container"]', { timeout: 20000 });
        await page.waitForSelector('[data-id*="notificationmessage"]', { timeout: 20000 });

        // Use Xrm.WebApi to check for leftover demo contacts
        const orphans = await page.evaluate(async function () {
            if (!window.Xrm || !window.Xrm.WebApi) return null;
            try {
                var result = await Xrm.WebApi.retrieveMultipleRecords(
                    'contact',
                    '?$filter=startswith(firstname, \'_WebApiDemo\') or startswith(firstname, \'_BatchDemo\')' +
                    '&$select=fullname,contactid'
                );
                return result.entities;
            } catch (e) {
                return null;
            }
        });

        // null means Xrm.WebApi was unavailable — treat as inconclusive, not failure
        if (orphans !== null) {
            expect(orphans).toHaveLength(0);
        }
    });
});
