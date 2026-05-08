// account.webapi.form.js — Ops.Forms.AccountWebApi
// Dev form: exercises all WebApi patterns against live Account data.
// Attach to the "Account - Dev: WebApi" form in the solution editor.
//
// Form editor setup:
//   Event:   onLoad
//   Handler: Ops.Forms.AccountWebApi.onLoad
//   Pass execution context: YES
//
// Web resource dependencies (load in this order):
//   1. debug.js
//   2. util.js
//   3. webapi.js
//   4. form.js
//   5. ui.js
//   6. constants.js
//   7. account.webapi.form.js  ← this file
//
// What this demonstrates (all run on onLoad for a live Account record):
//   getRecord       — fetch the current account by ID
//   getRecords      — raw OData query string
//   query()         — fluent query builder
//   create          — creates a child contact, logs the new ID
//   update          — updates the contact's jobtitle
//   delete          — deletes the contact (cleans up after itself)
//   batch           — runs create + update in a single HTTP request
//
// Outputs go to Ops.Debug log (F12 → Console) and via Ops.Debug.injectButton().
// The form does not need any fields beyond the standard Account fields.

var Ops = Ops || {};
Ops.Forms = Ops.Forms || {};

Ops.Forms.AccountWebApi = (function () {
    'use strict';

    var Form   = Ops.Form;
    var UI     = Ops.UI;
    var Debug  = Ops.Debug;
    var WebApi = Ops.WebApi;
    var Util   = Ops.Util;

    var Tables = Ops.Constants.Tables;
    var Fields = Ops.Constants.Fields;
    var Notif  = Ops.Constants.NotificationIds;

    Debug.setPrefix('Account.WebApi');

    // -------------------------------------------------------------------------
    // onLoad
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    async function onLoad(executionContext) {
        var formContext = executionContext.getFormContext();

        if (Form.isCreateForm(formContext)) {
            UI.setFormNotification(formContext,
                'Open an existing Account record to run the WebApi demo.',
                UI.NotificationLevel.Info, Notif.LoadError);
            return;
        }

        Debug.injectButton();
        Debug.info('onLoad — starting WebApi pattern demos');

        await UI.withProgress(async function () {
            await _demoGetRecord(formContext);
            await _demoFluentQuery(formContext);
            await _demoRawOdata(formContext);
            await _demoCrud(formContext);
            await _demoBatch(formContext);
        }, 'Running WebApi demos...');

        UI.setFormNotification(formContext,
            'WebApi demos complete. Open DevTools (F12) and run Ops.Debug.printTable() to inspect results.',
            UI.NotificationLevel.Info, Notif.NavStatus);
    }

    // -------------------------------------------------------------------------
    // getRecord — fetch specific columns from the current record
    // -------------------------------------------------------------------------

    async function _demoGetRecord(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            var account = await WebApi.getRecord(
                Tables.Account,
                accountId,
                ['name', 'statecode', 'industrycode', 'numberofemployees', 'revenue']
            );
            Debug.info('getRecord', {
                name:      account.name,
                statecode: account.statecode,
                revenue:   account['revenue']
            });
        } catch (err) {
            Debug.critical('_demoGetRecord failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // query() — fluent builder: related contacts for this account
    // -------------------------------------------------------------------------

    async function _demoFluentQuery(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            var contacts = await WebApi.query(Tables.Contact)
                .select('fullname', 'jobtitle', 'statuscode', 'emailaddress1')
                .where('parentcustomerid/accountid eq ' + accountId)
                .orderBy('fullname')
                .top(5)
                .getAll();

            Debug.info('query() — contacts for account', {
                count: contacts.length,
                names: contacts.map(function (c) { return c.fullname; })
            });
        } catch (err) {
            Debug.critical('_demoFluentQuery failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // getRecords — raw OData string for cases the builder doesn't cover
    // -------------------------------------------------------------------------

    async function _demoRawOdata(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            var result = await WebApi.getRecords(
                Tables.Opportunity,
                '?$filter=_customerid_value eq ' + accountId +
                '&$select=name,estimatedvalue,statecode' +
                '&$orderby=createdon desc' +
                '&$top=3'
            );
            Debug.info('getRecords (raw OData) — open opportunities', {
                count: result.length,
                names: result.map(function (o) { return o.name; })
            });
        } catch (err) {
            Debug.critical('_demoRawOdata failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // create / update / delete — full CRUD against a transient contact record
    // -------------------------------------------------------------------------

    async function _demoCrud(formContext) {
        var accountId = Form.getEntityId(formContext);
        var contactId = null;

        // create
        try {
            contactId = await WebApi.create(Tables.Contact, {
                firstname:            '_WebApiDemo',
                lastname:             'Contact',
                jobtitle:             'Initial title',
                'parentcustomerid_account@odata.bind': '/accounts(' + accountId + ')'
            });
            Debug.info('create — contact created', { contactId: contactId });
        } catch (err) {
            Debug.critical('_demoCrud create failed', err);
            return;
        }

        // update
        try {
            await WebApi.update(Tables.Contact, contactId, {
                jobtitle: 'Updated via WebApi.update()'
            });
            Debug.info('update — jobtitle updated', { contactId: contactId });
        } catch (err) {
            Debug.critical('_demoCrud update failed', err);
        }

        // verify update with getRecord
        try {
            var updated = await WebApi.getRecord(Tables.Contact, contactId, ['fullname', 'jobtitle']);
            Debug.info('getRecord after update', { jobtitle: updated.jobtitle });
        } catch (err) {
            Debug.warn('_demoCrud getRecord after update failed', err);
        }

        // delete — always clean up, even if update failed
        try {
            await WebApi.delete(Tables.Contact, contactId);
            Debug.info('delete — demo contact removed', { contactId: contactId });
        } catch (err) {
            Debug.critical('_demoCrud delete failed — orphaned record: ' + contactId, err);
        }
    }

    // -------------------------------------------------------------------------
    // batch — create + update in a single HTTP request
    // -------------------------------------------------------------------------

    async function _demoBatch(formContext) {
        var accountId = Form.getEntityId(formContext);
        var batchContactId = null;

        try {
            // Batch: two operations in one round-trip
            var batchResults = await WebApi.batch(function (requests) {
                requests.create(Tables.Contact, {
                    firstname: '_BatchDemo',
                    lastname:  'Contact',
                    jobtitle:  'Created in batch',
                    'parentcustomerid_account@odata.bind': '/accounts(' + accountId + ')'
                });
            });

            // batch() returns array of results for each operation
            batchContactId = batchResults[0];
            Debug.info('batch — contact created', { batchContactId: batchContactId });
        } catch (err) {
            Debug.critical('_demoBatch failed', err);
            return;
        }

        // Clean up the batch-created contact
        if (batchContactId && !Util.isNullOrUndefined(batchContactId)) {
            try {
                await WebApi.delete(Tables.Contact, batchContactId);
                Debug.info('batch cleanup — contact removed', { batchContactId: batchContactId });
            } catch (err) {
                Debug.warn('_demoBatch cleanup failed — orphaned: ' + batchContactId, err);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        onLoad: onLoad
    };
}());
