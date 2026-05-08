// account.form.js — Ops.Forms.Account
// Account main form event handler.
//
// Form editor setup — register ONE entry only:
//   Event:   onLoad
//   Handler: Ops.Forms.Account.onLoad
//   Pass execution context: YES
//
// All other handlers (onChange, onSave) are wired dynamically from within onLoad.
// No additional form editor entries are needed.
//
// Web resource dependencies (load in this order):
//   1. debug.js
//   2. util.js
//   3. webapi.js
//   4. form.js
//   5. ui.js
//   6. constants.js
//   7. account.form.js  ← this file
//
// Design rules:
//   - formContext is never stored at module level — captured fresh in every handler
//   - All async work in event handlers is fire-and-forget with .catch()
//   - onSave: all validation state captured synchronously before any await

var Ops = Ops || {};
Ops.Forms = Ops.Forms || {};

Ops.Forms.Account = (function () {
    'use strict';

    // Aliases — mirror of "using AccountFields = ..." in the plugin base
    var Fields  = Ops.Constants.Fields.Account;
    var Options = Ops.Constants.OptionSets.Account;
    var Notif   = Ops.Constants.NotificationIds;
    var Tabs    = Ops.Constants.FormControls.Account.Tabs;

    Ops.Debug.setPrefix('Account.form');

    // -------------------------------------------------------------------------
    // onLoad — the only entry point registered in the form editor
    // -------------------------------------------------------------------------

    async function onLoad(executionContext) {
        var formContext = executionContext.getFormContext();
        Ops.Debug.info('onLoad', { formType: Ops.Form.getFormType(formContext) });

        _wireHandlers(formContext);
        await _initializeForm(formContext);
    }

    // Wire all onChange and onSave handlers — always remove-then-add (prevents stacking on re-load).
    // onSave is registered here so the form editor only needs one entry (onLoad).
    function _wireHandlers(formContext) {
        Ops.Form.addOnChange(formContext, Fields.StatusCode, onStatusCodeChange);
        Ops.Form.addOnChange(formContext, Fields.IndustryCode, onIndustryCodeChange);

        formContext.data.entity.removeOnSave(onSave);
        formContext.data.entity.addOnSave(onSave);
    }

    async function _initializeForm(formContext) {
        if (Ops.Form.isCreateForm(formContext)) return;

        var entityId = Ops.Form.getEntityId(formContext);
        Ops.Debug.verbose('_initializeForm', { id: entityId });

        try {
            await _applyStatusDrivenFieldState(formContext);
        } catch (err) {
            Ops.Debug.critical('_initializeForm failed', err);
            Ops.UI.setFormNotification(
                formContext,
                'An error occurred loading form state. Refresh and try again.',
                Ops.UI.NotificationLevel.Warning,
                Notif.LoadError
            );
        }
    }

    // -------------------------------------------------------------------------
    // onChange handlers — named functions so removeOnChange works
    // -------------------------------------------------------------------------

    function onStatusCodeChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var statusCode = Ops.Form.getValue(formContext, Fields.StatusCode);
        Ops.Debug.info('onStatusCodeChange', { statusCode: statusCode });

        _applyStatusDrivenFieldState(formContext).catch(function (err) {
            Ops.Debug.critical('onStatusCodeChange async error', err);
        });
    }

    function onIndustryCodeChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var industry = Ops.Form.getValue(formContext, Fields.IndustryCode);
        Ops.Debug.verbose('onIndustryCodeChange', { industry: industry });
        // Add industry-driven logic here
    }

    // -------------------------------------------------------------------------
    // onSave — critical pattern: capture all sync state before any async work.
    // D365 does not await onSave; preventSave() must be called synchronously.
    // -------------------------------------------------------------------------

    function onSave(executionContext) {
        var formContext = executionContext.getFormContext();
        var saveMode    = Ops.UI.getSaveMode(executionContext);

        Ops.Debug.info('onSave', { saveMode: saveMode });

        if (saveMode === Ops.UI.SaveMode.AutoSave) return;

        // Capture all validation state synchronously — formContext may be stale after any await
        var name = Ops.Form.getValue(formContext, Fields.Name);

        if (Ops.Util.isNullOrEmpty(name)) {
            Ops.UI.preventSave(executionContext);
            Ops.UI.setFormNotification(
                formContext,
                'Account name is required.',
                Ops.UI.NotificationLevel.Error,
                Notif.ValidationWarn
            );
            return;
        }

        Ops.UI.clearFormNotification(formContext, Notif.ValidationWarn);

        // Async post-save side-effects go here — do not await, do not block the save
        // _doPostSaveWork(formContext).catch(function(err) { Ops.Debug.critical('post-save error', err); });
    }

    // -------------------------------------------------------------------------
    // Field state logic — driven by status code
    // -------------------------------------------------------------------------

    async function _applyStatusDrivenFieldState(formContext) {
        var statusCode = Ops.Form.getValue(formContext, Fields.StatusCode);
        var isActive   = statusCode === Options.StatusCode.Active;

        Ops.Form.applyFieldStates(formContext, [
            { name: Fields.IndustryCode,  disabled: !isActive },
            { name: Fields.AccountNumber, disabled: !isActive }
        ]);

        if (!isActive) {
            Ops.UI.setFormNotification(
                formContext,
                'This account is inactive. Some fields are read-only.',
                Ops.UI.NotificationLevel.Warning,
                Notif.PermissionWarn
            );
        } else {
            Ops.UI.clearFormNotification(formContext, Notif.PermissionWarn);
        }

        if (isActive && Ops.Form.isUpdateForm(formContext)) {
            await _loadSupplementalData(formContext);
        }
    }

    async function _loadSupplementalData(formContext) {
        var accountId = Ops.Form.getEntityId(formContext);
        if (Ops.Util.isNullOrUndefined(accountId)) return;

        try {
            var contacts = await Ops.WebApi.query('contact')
                .where('parentcustomerid/accountid eq ' + accountId)
                .select('fullname', 'statuscode')
                .orderBy('fullname')
                .top(10)
                .getAll();
            Ops.Debug.verbose('_loadSupplementalData: ' + contacts.length + ' contact(s)');
            // Use contacts to populate a custom field or drive UI state
        } catch (err) {
            Ops.Debug.warn('_loadSupplementalData failed — non-blocking', err);
        }
    }

    // -------------------------------------------------------------------------
    // Public surface — only event handler entry points are exported
    // -------------------------------------------------------------------------

    return {
        onLoad:               onLoad,
        onStatusCodeChange:   onStatusCodeChange,
        onIndustryCodeChange: onIndustryCodeChange,
        onSave:               onSave
    };
}());
