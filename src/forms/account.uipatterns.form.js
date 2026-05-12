// account.uipatterns.form.js — Ops.Forms.AccountUiPatterns
// Dev form: exercises all UI and form interaction patterns.
// Attach to the "Account - Dev: UI Patterns" form in the solution editor.
//
// Form editor setup:
//   Event:   onLoad
//   Handler: Ops.Forms.AccountUiPatterns.onLoad
//   Pass execution context: YES
//
//   Event:   onSave
//   (wired dynamically — no additional entry needed)
//
// Web resource dependencies (load in this order):
//   1. debug.js
//   2. util.js
//   3. webapi.js
//   4. form.js
//   5. ui.js
//   6. constants.js
//   7. account.uipatterns.form.js  ← this file
//
// What this demonstrates:
//   Notifications     — setFormNotification, clearFormNotification, setTimedFormNotification
//   Dialogs           — confirm (async), alert (async)
//   Progress          — withProgress wrapping an async operation
//   Field state       — applyFieldStates: required / visible / disabled
//   Tab navigation    — navigateToTab, navigateToControl
//   onChange guard    — addOnChange on Name field with debounce-style validation
//   onSave guard      — preventSave with timed auto-clearing notification
//   Debug button      — injectButton() — floating clipboard button

var Ops = Ops || {};
Ops.Forms = Ops.Forms || {};

Ops.Forms.AccountUiPatterns = (function () {
    'use strict';

    var Form, UI, Debug, WebApi, Util, Fields, Notif, Tabs;

    // Deferred until onLoad — guarantees all Ops.* modules are loaded before capture
    function _init() {
        Form   = Ops.Form;
        UI     = Ops.UI;
        Debug  = Ops.Debug;
        WebApi = Ops.WebApi;
        Util   = Ops.Util;
        Fields = Ops.Constants.Fields.Account;
        Notif  = Ops.Constants.NotificationIds;
        Tabs   = Ops.Constants.FormControls.Account.Tabs;
        Debug.setPrefix('Account.UiPatterns');
    }

    // -------------------------------------------------------------------------
    // onLoad
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    async function onLoad(executionContext) {
        _init();
        var formContext = executionContext.getFormContext();
        Debug.info(onLoad.name, { formType: Form.getFormType(formContext) });

        Debug.injectButton();
        UI.setFormNotification(
            formContext,
            'Debug log: Ops.Debug.printTable() to view, Ops.Debug.copyToClipboard() to copy.',
            UI.NotificationLevel.Info,
            Notif.DebugHint
        );
        _wireHandlers(formContext);

        try {
            if (Form.isCreateForm(formContext)) {
                _demoNotifications(formContext);
                return;
            }

            await _demoWithProgress(formContext);
            _demoFieldStates(formContext);
            _demoNotifications(formContext);
        } catch (err) {
            Debug.critical(onLoad.name + ' failed', err);
        }
    }

    function _wireHandlers(formContext) {
        Form.addOnChange(formContext, Fields.Name, onNameChange);
        Form.addOnChange(formContext, Fields.IndustryCode, onIndustryCodeChange);

        formContext.data.entity.removeOnSave(onSave);
        formContext.data.entity.addOnSave(onSave);
    }

    // -------------------------------------------------------------------------
    // Notifications demo — shows each level then auto-clears
    // -------------------------------------------------------------------------

    function _demoNotifications(formContext) {
        // Timed INFO — auto-clears after 4s
        UI.setTimedFormNotification(
            formContext,
            'UI Patterns form loaded. Notifications, field states, and onSave guard are active.',
            UI.NotificationLevel.Info,
            Notif.NavStatus,
            4000
        );

        // Persistent warning shown only on inactive accounts (cleared by field state logic)
        var stateCode = Form.getValue(formContext, 'statecode');
        if (stateCode === 1) {
            UI.setFormNotification(
                formContext,
                'This account is inactive. Fields are locked.',
                UI.NotificationLevel.Warning,
                Notif.PermissionWarn
            );
        }
    }

    // -------------------------------------------------------------------------
    // withProgress demo — wraps a short async operation
    // -------------------------------------------------------------------------

    async function _demoWithProgress(formContext) {
        var accountId = Form.getEntityId(formContext);

        try {
            var result = await UI.withProgress(async function () {
                return await WebApi.getRecord(
                    Ops.Constants.Tables.Account.logicalName,
                    accountId,
                    'name,numberofemployees,revenue'
                );
            }, 'Loading account data...');

            Debug.info(_demoWithProgress.name + ' result', {
                name:      result.name,
                employees: result.numberofemployees
            });
        } catch (err) {
            Debug.warn(_demoWithProgress.name + ' failed — non-blocking', err);
        }
    }

    // -------------------------------------------------------------------------
    // Field state demo — locks all fields on inactive accounts
    // -------------------------------------------------------------------------

    function _demoFieldStates(formContext) {
        var stateCode = Form.getValue(formContext, 'statecode');
        var isActive  = stateCode === 0;

        Form.applyFieldStates(formContext, [
            { name: Fields.Name,          disabled: !isActive },
            { name: Fields.IndustryCode,  disabled: !isActive, required: isActive },
            { name: Fields.AccountNumber, disabled: !isActive }
        ]);

        Debug.info(_demoFieldStates.name + ' applied', { isActive: isActive });
    }

    // -------------------------------------------------------------------------
    // onChange handlers
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    function onNameChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var name        = Form.getValue(formContext, Fields.Name);
        Debug.info(onNameChange.name, { name: name });

        if (Util.isNullOrEmpty(name)) {
            UI.setFormNotification(
                formContext,
                'Account name cannot be empty.',
                UI.NotificationLevel.Error,
                Notif.ValidationWarn
            );
        } else {
            UI.clearFormNotification(formContext, Notif.ValidationWarn);
        }
    }

    /** @param {Xrm.Events.EventContext} executionContext */
    function onIndustryCodeChange(executionContext) {
        var formContext  = executionContext.getFormContext();
        var industryCode = Form.getValue(formContext, Fields.IndustryCode);
        Debug.verbose(onIndustryCodeChange.name, { industryCode: industryCode });

        // Demo: navigate to Summary tab whenever industry changes
        if (Tabs && Tabs.Summary) {
            UI.navigateToTab(formContext, Tabs.Summary);
        }
    }

    // -------------------------------------------------------------------------
    // onSave — demonstrates confirm dialog and preventSave
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.SaveEventContext} executionContext */
    function onSave(executionContext) {
        var formContext = executionContext.getFormContext();
        var saveMode    = UI.getSaveMode(executionContext);

        Debug.info(onSave.name, { saveMode: saveMode });

        if (saveMode === UI.SaveMode.AutoSave) return;

        // Capture sync state before any await
        var name        = Form.getValue(formContext, Fields.Name);
        var isDirty     = Form.isDirty(formContext);
        var nameDirty   = Form.isAttributeDirty(formContext, Fields.Name);

        Debug.verbose(onSave.name + ' state', { name: name, isDirty: isDirty, nameDirty: nameDirty });

        // Validation: block save if name is empty
        if (Util.isNullOrEmpty(name)) {
            UI.preventSave(executionContext);
            UI.setTimedFormNotification(
                formContext,
                'Account name is required to save.',
                UI.NotificationLevel.Error,
                Notif.ValidationWarn,
                5000,
                function () { return !Util.isNullOrEmpty(Form.getValue(formContext, Fields.Name)); }
            );
            return;
        }

        UI.clearFormNotification(formContext, Notif.ValidationWarn);

        // Demo: fire-and-forget confirm dialog after save (does not block the save)
        // In production this pattern is used for post-save side-effect prompts
        if (nameDirty) {
            _promptPostSaveAction(formContext, name).catch(function (err) {
                Debug.warn(_promptPostSaveAction.name + ' failed', err);
            });
        }
    }

    // Demonstrates async confirm dialog — called after save completes (fire-and-forget from onSave)
    async function _promptPostSaveAction(formContext, name) {
        // Small delay to let the save complete and the form re-render
        await new Promise(function (r) { setTimeout(r, 800); });

        var confirmed = await UI.confirm({
            title:              'Name changed to "' + name + '"',
            subtitle:           'Would you like to view related contacts?',
            confirmButtonLabel: 'View Contacts',
            cancelButtonLabel:  'Dismiss'
        });

        if (confirmed) {
            // Demo: navigate to Details tab (change to match your actual tab name)
            if (Tabs && Tabs.Details) {
                UI.navigateToTab(formContext, Tabs.Details);
            }
            Debug.info(_promptPostSaveAction.name + ' — user chose to view contacts');
        }
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        onLoad: onLoad,
        onSave: onSave,
        onNameChange:        onNameChange,
        onIndustryCodeChange: onIndustryCodeChange
    };
}());
