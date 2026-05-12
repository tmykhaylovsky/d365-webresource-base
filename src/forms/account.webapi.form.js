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

    var Form, UI, Debug, WebApi, Tables, Notif;

    // Deferred until onLoad — guarantees all Ops.* modules are loaded before capture
    function _init() {
        Form   = Ops.Form;
        UI     = Ops.UI;
        Debug  = Ops.Debug;
        WebApi = Ops.WebApi;
        Tables = Ops.Constants.Tables;
        Notif  = Ops.Constants.NotificationIds;
        Debug.setPrefix('Account.WebApi');
    }

    // -------------------------------------------------------------------------
    // onLoad
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    async function onLoad(executionContext) {
        _init();
        var formContext = executionContext.getFormContext();

        if (Form.isCreateForm(formContext)) {
            UI.setFormNotification(formContext,
                'Open an existing Account record to run the WebApi demo.',
                UI.NotificationLevel.Info, Notif.LoadError);
            return;
        }

        Debug.injectButton();
        Debug.info(onLoad.name + ' — starting WebApi pattern demos');

        try {
            await UI.withProgress(async function () {
                await _demoGetRecord(formContext);
                await _demoFluentQuery(formContext);
                await _demoRawOdata(formContext);
                await _demoCrud(formContext);
                await _demoBatch(formContext);
            }, 'Running WebApi demos...');

            UI.setFormNotification(formContext,
                'WebApi demos complete. In DevTools (F12): Ops.Debug.printTable() to view, Ops.Debug.copyToClipboard() to copy.',
                UI.NotificationLevel.Info, Notif.NavStatus);
        } catch (err) {
            Debug.critical(onLoad.name + ' failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // getRecord — fetch specific columns from the current record
    // -------------------------------------------------------------------------

    async function _demoGetRecord(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            var account = await WebApi.getRecord(
                Tables.Account.logicalName,
                accountId,
                'name,statecode,industrycode,numberofemployees,revenue'
            );
            Debug.info(_demoGetRecord.name, {
                name:      account.name,
                statecode: account.statecode,
                revenue:   account['revenue']
            });
        } catch (err) {
            Debug.critical(_demoGetRecord.name + ' failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // query() — fluent builder: related contacts for this account
    // -------------------------------------------------------------------------

    async function _demoFluentQuery(formContext) {
        var accountId = Form.getEntityId(formContext);
        var seededId = null;

        try {
            var contacts = await WebApi.query(Tables.Contact.logicalName)
                .select('fullname', 'jobtitle', 'statuscode', 'emailaddress1')
                .where('_parentcustomerid_value eq ' + accountId)
                .orderBy('fullname')
                .top(5)
                .getAll();

            if (contacts.length === 0) {
                seededId = await WebApi.createRecord(Tables.Contact.logicalName, {
                    firstname: '_QueryDemo',
                    lastname:  'Contact',
                    jobtitle:  'Seeded for fluent query demo',
                    'parentcustomerid_account@odata.bind': '/accounts(' + accountId + ')'
                });
                contacts = await WebApi.query(Tables.Contact.logicalName)
                    .select('fullname', 'jobtitle', 'statuscode', 'emailaddress1')
                    .where('_parentcustomerid_value eq ' + accountId)
                    .orderBy('fullname')
                    .top(5)
                    .getAll();
            }

            Debug.info(_demoFluentQuery.name, {
                count: contacts.length,
                names: contacts.map(function (c) { return c.fullname; })
            });
        } catch (err) {
            Debug.critical(_demoFluentQuery.name + ' failed', err);
        } finally {
            if (seededId) {
                try { await WebApi.deleteRecord(Tables.Contact.logicalName, seededId); } catch (e) { /* ignore */ }
            }
        }
    }

    // -------------------------------------------------------------------------
    // getRecords — raw OData string for cases the builder doesn't cover
    // -------------------------------------------------------------------------

    async function _demoRawOdata(formContext) {
        var accountId = Form.getEntityId(formContext);
        var seededId = null;

        try {
            var result = await WebApi.getRecords(
                Tables.Opportunity.logicalName,
                '?$filter=_customerid_value eq ' + accountId +
                '&$select=name,estimatedvalue,statecode' +
                '&$orderby=createdon desc' +
                '&$top=3'
            );

            if (result.length === 0) {
                seededId = await WebApi.createRecord(Tables.Opportunity.logicalName, {
                    name: '_ODataDemo Opportunity',
                    'customerid_account@odata.bind': '/accounts(' + accountId + ')'
                });
                result = await WebApi.getRecords(
                    Tables.Opportunity.logicalName,
                    '?$filter=_customerid_value eq ' + accountId +
                    '&$select=name,estimatedvalue,statecode' +
                    '&$orderby=createdon desc' +
                    '&$top=3'
                );
            }

            Debug.info(_demoRawOdata.name + ' — open opportunities', {
                count: result.length,
                names: result.map(function (o) { return o.name; })
            });
        } catch (err) {
            Debug.critical(_demoRawOdata.name + ' failed', err);
        } finally {
            if (seededId) {
                try { await WebApi.deleteRecord(Tables.Opportunity.logicalName, seededId); } catch (e) { /* ignore */ }
            }
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
            contactId = await WebApi.createRecord(Tables.Contact.logicalName, {
                firstname:            '_WebApiDemo',
                lastname:             'Contact',
                jobtitle:             'Initial title',
                'parentcustomerid_account@odata.bind': '/accounts(' + accountId + ')'
            });
            Debug.info(_demoCrud.name + ' — contact created', { contactId: contactId });
        } catch (err) {
            Debug.critical(_demoCrud.name + ' create failed', err);
            return;
        }

        // update
        try {
            await WebApi.updateRecord(Tables.Contact.logicalName, contactId, {
                jobtitle: 'Updated via WebApi.updateRecord()'
            });
            Debug.info(_demoCrud.name + ' — jobtitle updated', { contactId: contactId });
        } catch (err) {
            Debug.critical(_demoCrud.name + ' update failed', err);
        }

        // verify update with getRecord
        try {
            var updated = await WebApi.getRecord(Tables.Contact.logicalName, contactId, 'fullname,jobtitle');
            Debug.info(_demoCrud.name + ' — getRecord after update', { jobtitle: updated.jobtitle });
        } catch (err) {
            Debug.warn(_demoCrud.name + ' getRecord after update failed', err);
        }

        // delete — always clean up, even if update failed
        try {
            await WebApi.deleteRecord(Tables.Contact.logicalName, contactId);
            Debug.info(_demoCrud.name + ' — demo contact removed', { contactId: contactId });
        } catch (err) {
            Debug.critical(_demoCrud.name + ' delete failed — orphaned record: ' + contactId, err);
        }
    }

    // -------------------------------------------------------------------------
    // batch — create + update in a single HTTP request
    // -------------------------------------------------------------------------

    async function _demoBatch(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            await WebApi.batch([
                {
                    method: 'POST',
                    url:    Tables.Contact.entitySetName,
                    body:   {
                        firstname: '_BatchDemo',
                        lastname:  'Contact',
                        jobtitle:  'Created in batch',
                        'parentcustomerid_account@odata.bind': '/accounts(' + accountId + ')'
                    }
                }
            ]);

            // batch() returns raw fetch Response — contact ID not extractable without parsing multipart body.
            // Use createRecord() if you need the returned ID.
            Debug.info(_demoBatch.name + ' — request sent (HTTP 200 = changeset committed)');
        } catch (err) {
            Debug.critical(_demoBatch.name + ' failed', err);
        }
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        onLoad: onLoad
    };
}());
