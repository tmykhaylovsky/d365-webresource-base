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

// @ts-ignore — namespace merge pattern; Ops is always loaded before this file
var Ops = Ops || {};
Ops.Forms = Ops.Forms || {};

Ops.Forms.Account = (function () {
    'use strict';

    var Form, UI, Debug, WebApi, Util, Fields, Options, Notif;

    // Deferred until onLoad — guarantees all Ops.* modules are loaded before capture
    function _init() {
        Form    = Ops.Form;
        UI      = Ops.UI;
        Debug   = Ops.Debug;
        WebApi  = Ops.WebApi;
        Util    = Ops.Util;
        Fields  = Ops.Constants.Fields.Account;
        Options = Ops.Constants.OptionSets.Account;
        Notif   = Ops.Constants.NotificationIds;
        Debug.setPrefix('Account.form');
    }

    // -------------------------------------------------------------------------
    // onLoad — the only entry point registered in the form editor
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    async function onLoad(executionContext) {
        _init();
        var formContext = executionContext.getFormContext();
        Debug.info(onLoad.name, { formType: Form.getFormType(formContext) });

        try {
            _wireHandlers(formContext);
            await _initializeForm(formContext);
        } catch (err) {
            Debug.critical(onLoad.name + ' failed', err);
        }
    }

    // Wire all onChange and onSave handlers — always remove-then-add (prevents stacking on re-load).
    // onSave is registered here so the form editor only needs one entry (onLoad).
    function _wireHandlers(formContext) {
        Form.addOnChange(formContext, Fields.StatusCode, onStatusCodeChange);
        Form.addOnChange(formContext, Fields.IndustryCode, onIndustryCodeChange);

        formContext.data.entity.removeOnSave(onSave);
        formContext.data.entity.addOnSave(onSave);
    }

    async function _initializeForm(formContext) {
        Debug.injectButton();
        if (Form.isCreateForm(formContext)) return;

        var entityId = Form.getEntityId(formContext);
        Debug.verbose(_initializeForm.name, { id: entityId });

        try {
            await _applyStatusDrivenFieldState(formContext);
        } catch (err) {
            Debug.critical(_initializeForm.name + ' failed', err);
            UI.setFormNotification(
                formContext,
                'An error occurred loading form state. Refresh and try again.',
                UI.NotificationLevel.Warning,
                Notif.LoadError
            );
        }
    }

    // -------------------------------------------------------------------------
    // onChange handlers — named functions so removeOnChange works
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    function onStatusCodeChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var statusCode = Form.getValue(formContext, Fields.StatusCode);
        Debug.info(onStatusCodeChange.name, { statusCode: statusCode });

        _applyStatusDrivenFieldState(formContext).catch(function (err) {
            Debug.critical(onStatusCodeChange.name + ' async error', err);
        });
    }

    /** @param {Xrm.Events.EventContext} executionContext */
    function onIndustryCodeChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var industry = Form.getValue(formContext, Fields.IndustryCode);
        Debug.verbose(onIndustryCodeChange.name, { industry: industry });
        // Add industry-driven logic here
    }

    // -------------------------------------------------------------------------
    // onSave — critical pattern: capture all sync state before any async work.
    // D365 does not await onSave; preventSave() must be called synchronously.
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.SaveEventContext} executionContext */
    function onSave(executionContext) {
        var formContext = executionContext.getFormContext();
        var saveMode    = UI.getSaveMode(executionContext);

        Debug.info(onSave.name, { saveMode: saveMode });

        if (saveMode === UI.SaveMode.AutoSave) return;

        // Capture all validation state synchronously — formContext may be stale after any await
        var name = Form.getValue(formContext, Fields.Name);

        if (Util.isNullOrEmpty(name)) {
            UI.preventSave(executionContext);
            UI.setFormNotification(
                formContext,
                'Account name is required.',
                UI.NotificationLevel.Error,
                Notif.ValidationWarn
            );
            return;
        }

        UI.clearFormNotification(formContext, Notif.ValidationWarn);

        // Async post-save side-effects go here — do not await, do not block the save
        // _doPostSaveWork(formContext).catch(function(err) { Debug.critical(onSave.name + ' post-save error', err); });
    }

    // -------------------------------------------------------------------------
    // Field state logic — driven by status code
    // -------------------------------------------------------------------------

    async function _applyStatusDrivenFieldState(formContext) {
        var statusCode = Form.getValue(formContext, Fields.StatusCode);
        var isActive   = statusCode === Options.StatusCode.Active;

        Form.applyFieldStates(formContext, [
            { name: Fields.IndustryCode,  disabled: !isActive },
            { name: Fields.AccountNumber, disabled: !isActive }
        ]);

        if (!isActive) {
            UI.setFormNotification(
                formContext,
                'This account is inactive. Some fields are read-only.',
                UI.NotificationLevel.Warning,
                Notif.PermissionWarn
            );
        } else {
            UI.clearFormNotification(formContext, Notif.PermissionWarn);
        }

        if (isActive && Form.isUpdateForm(formContext)) {
            await _loadSupplementalData(formContext);
        }
    }

    async function _loadSupplementalData(formContext) {
        var accountId = Form.getEntityId(formContext);
        if (Util.isNullOrUndefined(accountId)) return;

        try {
            var contacts = await WebApi.query('contact')
                .where('_parentcustomerid_value eq ' + accountId)
                .select('fullname', 'statuscode')
                .orderBy('fullname')
                .top(10)
                .getAll();
            Debug.verbose(_loadSupplementalData.name + ': ' + contacts.length + ' contact(s)');
            // Use contacts to populate a custom field or drive UI state
        } catch (err) {
            Debug.warn(_loadSupplementalData.name + ' failed — non-blocking', err);
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
