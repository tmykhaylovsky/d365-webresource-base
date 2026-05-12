// opportunity.form.js — Ops.Forms.Opportunity
// Dev + reference form: demonstrates the full Opportunity lifecycle.
// Attach to the "Opportunity - Dev: Lifecycle" form in the solution editor.
//
// Form editor setup:
//   Event: onLoad  → Handler: Ops.Forms.Opportunity.onLoad   — Pass execution context: YES
//   Event: onSave  → (wired dynamically — no additional entry needed)
//
// Web resource dependencies (load in this order):
//   1. debug.js
//   2. util.js
//   3. webapi.js
//   4. form.js
//   5. ui.js
//   6. constants.js
//   7. opportunity.form.js  ← this file
//
// Patterns demonstrated:
//   statuscode interception — synchronous field reset before async win/lose flow
//   WinOpportunity / LoseOpportunity — raw fetch actions with audit activity
//   ReopenOpportunity — direct PATCH (no action needed; no audit activity)
//   getLookupId — extract GUID from customer lookup for API call
//   toLocalMidnightDate — normalize datetime ISO from Web API to local Date for comparison
//   associate / disassociate — Opportunity ↔ Competitor via opportunitycompetitors nav property
//   onSave synchronous capture — ALL getValue / getIsDirty before first await

// @ts-ignore — namespace merge pattern; Ops is always loaded before this file
var Ops = Ops || {};
Ops.Forms = Ops.Forms || {};

Ops.Forms.Opportunity = (function () {
    'use strict';

    var Form, UI, Debug, WebApi, Util, Fields, Options, Notif, Tables, Relationships;

    // Module-level: captures statuscode synchronously before onChange fires.
    // Must be IIFE-scope, not inside a function — persists across event calls.
    var _prevStatusCode = null;

    // singleFlight-wrapped flows — initialized in _init() after Util is available.
    var _winFlow  = null;
    var _loseFlow = null;

    // -------------------------------------------------------------------------
    // Init — deferred until onLoad so all Ops.* modules are loaded
    // -------------------------------------------------------------------------

    function _init() {
        Form          = Ops.Form;
        UI            = Ops.UI;
        Debug         = Ops.Debug;
        WebApi        = Ops.WebApi;
        Util          = Ops.Util;
        Fields        = Ops.Constants.Fields.Opportunity;
        Options       = Ops.Constants.OptionSets.Opportunity;
        Notif         = Ops.Constants.NotificationIds;
        Tables        = Ops.Constants.Tables;
        Relationships = Ops.Constants.Relationships;
        Debug.setPrefix('Opportunity.form');

        _winFlow  = Util.singleFlight(_winFlowImpl);
        _loseFlow = Util.singleFlight(_loseFlowImpl);
    }

    // -------------------------------------------------------------------------
    // onLoad — the only entry point registered in the form editor
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    async function onLoad(executionContext) {
        _init();
        var formContext = executionContext.getFormContext();
        Debug.info(onLoad.name, { formType: Form.getFormType(formContext) });

        if (Form.isCreateForm(formContext)) {
            UI.setFormNotification(
                formContext,
                'New Opportunity — fill in details and save to begin tracking.',
                UI.NotificationLevel.Info,
                Notif.NavStatus
            );
            return;
        }

        // Capture _prevStatusCode synchronously — must be before any await
        _prevStatusCode = Form.getValue(formContext, Fields.StatusCode);

        _wireHandlers(formContext);

        try {
            var stateCode = Form.getValue(formContext, Fields.StateCode);
            if (stateCode === Options.StateCode.Won) {
                _applyWonState(formContext);
            } else if (stateCode === Options.StateCode.Lost) {
                _applyLostState(formContext);
            } else {
                _applyFieldStates(formContext, _prevStatusCode);
            }
        } catch (err) {
            Debug.critical(onLoad.name + ' state application failed', err);
        }

        // Fire-and-forget: demo related data load — non-blocking
        _demoLoadRelatedData(formContext).catch(function (err) {
            Debug.warn('_demoLoadRelatedData failed', err);
        });

        Debug.injectButton();
    }

    // -------------------------------------------------------------------------
    // Handler wiring
    // -------------------------------------------------------------------------

    function _wireHandlers(formContext) {
        Form.addOnChange(formContext, Fields.StatusCode,     onStatusCodeChange);
        Form.addOnChange(formContext, Fields.EstimatedClose, onEstimatedCloseDateChange);

        formContext.data.entity.removeOnSave(onSave);
        formContext.data.entity.addOnSave(onSave);
    }

    // -------------------------------------------------------------------------
    // onStatusCodeChange — statuscode interception pattern
    // Reset the field SYNCHRONOUSLY before any async work — the user sees the
    // previous value while the confirm dialog is open.
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    function onStatusCodeChange(executionContext) {
        var formContext  = executionContext.getFormContext();
        var newValue     = Form.getValue(formContext, Fields.StatusCode);
        Debug.info(onStatusCodeChange.name, { prev: _prevStatusCode, next: newValue });

        if (newValue === Options.StatusCode.Won) {
            // Reset synchronously — user sees the old value during the confirm dialog
            Form.setValue(formContext, Fields.StatusCode, _prevStatusCode);
            _winFlow(formContext).catch(function (err) {
                Debug.critical('_winFlow failed', err);
            });
            return;
        }

        if (newValue === Options.StatusCode.Canceled || newValue === Options.StatusCode.OutSold) {
            Form.setValue(formContext, Fields.StatusCode, _prevStatusCode);
            _loseFlow(formContext, newValue).catch(function (err) {
                Debug.critical('_loseFlow failed', err);
            });
            return;
        }

        // InProgress or OnHold — no interception needed
        _prevStatusCode = newValue;
        _applyFieldStates(formContext, newValue);
    }

    // -------------------------------------------------------------------------
    // Win / Lose flows — wrapped with singleFlight in _init()
    // -------------------------------------------------------------------------

    async function _winFlowImpl(formContext) {
        var confirmed = await UI.confirm({
            title:    'Mark as Won?',
            subtitle: 'This will close the opportunity and create an audit record.'
        });
        if (!confirmed) return;

        var opportunityId = Form.getEntityId(formContext);
        var subject       = Form.getValue(formContext, Fields.Name) || 'Won';

        await UI.withProgress(function () {
            return WebApi.winOpportunity(opportunityId, subject);
        }, 'Closing as Won...');

        UI.setTimedFormNotification(
            formContext,
            'Opportunity marked as Won.',
            UI.NotificationLevel.Info,
            Notif.NavStatus,
            3000
        );

        formContext.data.refresh(false);
    }

    async function _loseFlowImpl(formContext, statusCode) {
        var subtitle = statusCode === Options.StatusCode.Canceled
            ? 'Reason: Canceled'
            : 'Reason: Out-sold';

        var confirmed = await UI.confirm({
            title:    'Mark as Lost?',
            subtitle: subtitle
        });
        if (!confirmed) return;

        var opportunityId = Form.getEntityId(formContext);
        var subject       = Form.getValue(formContext, Fields.Name) || 'Lost';

        await UI.withProgress(function () {
            return WebApi.loseOpportunity(opportunityId, statusCode, subject);
        }, 'Closing as Lost...');

        UI.setTimedFormNotification(
            formContext,
            'Opportunity marked as Lost.',
            UI.NotificationLevel.Info,
            Notif.NavStatus,
            3000
        );

        formContext.data.refresh(false);
    }

    // -------------------------------------------------------------------------
    // Won / Lost state application
    // -------------------------------------------------------------------------

    function _applyWonState(formContext) {
        _lockClosedFields(formContext);
        UI.setFormNotification(
            formContext,
            'Opportunity is Won. Fields are locked.',
            UI.NotificationLevel.Warning,
            Notif.PermissionWarn
        );
        _injectReopenButton(formContext);
    }

    function _applyLostState(formContext) {
        _lockClosedFields(formContext);
        UI.setFormNotification(
            formContext,
            'Opportunity is Lost. Fields are locked.',
            UI.NotificationLevel.Warning,
            Notif.PermissionWarn
        );
        _injectReopenButton(formContext);
    }

    function _lockClosedFields(formContext) {
        Form.applyFieldStates(formContext, [
            { name: Fields.Name,           disabled: true },
            { name: Fields.EstimatedValue, disabled: true },
            { name: Fields.EstimatedClose, disabled: true },
            { name: Fields.CustomerId,     disabled: true },
            { name: Fields.Description,    disabled: true }
        ]);
    }

    // Injects a plain DOM button that reopens the opportunity.
    // Debug.injectButton() does not accept callbacks — a separate element is needed.
    function _injectReopenButton(formContext) {
        var existingBtn = document.getElementById('ops-reopen-btn');
        if (existingBtn) return;

        var btn = document.createElement('button');
        btn.id          = 'ops-reopen-btn';
        btn.textContent = 'Reopen Opportunity';
        btn.style.cssText = 'margin:8px;padding:6px 12px;cursor:pointer;';

        btn.addEventListener('click', function () {
            var opportunityId = Form.getEntityId(formContext);
            WebApi.reopenOpportunity(opportunityId)
                .then(function () { formContext.data.refresh(false); })
                .catch(function (err) { Debug.critical('reopenOpportunity failed', err); });
        });

        var header = document.querySelector('.ms-crm-Form-Header');
        if (header) {
            header.appendChild(btn);
        } else {
            document.body.appendChild(btn);
        }
    }

    // -------------------------------------------------------------------------
    // Field states for open opportunities
    // -------------------------------------------------------------------------

    function _applyFieldStates(formContext, statusCode) {
        var isOnHold = statusCode === Options.StatusCode.OnHold;

        Form.applyFieldStates(formContext, [
            { name: Fields.Name,           disabled: false },
            { name: Fields.EstimatedValue, disabled: false },
            { name: Fields.EstimatedClose, disabled: false },
            { name: Fields.CustomerId,     disabled: false },
            { name: Fields.Description,    disabled: false }
        ]);

        if (isOnHold) {
            UI.setFormNotification(
                formContext,
                'Opportunity is on hold.',
                UI.NotificationLevel.Warning,
                Notif.PermissionWarn
            );
        } else {
            UI.clearFormNotification(formContext, Notif.PermissionWarn);
        }
    }

    // -------------------------------------------------------------------------
    // onSave — all sync state captured before any await
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.SaveEventContext} executionContext */
    function onSave(executionContext) {
        var formContext    = executionContext.getFormContext();

        // Capture ALL synchronous state before any await — D365 does not await onSave
        var saveMode       = UI.getSaveMode(executionContext);
        var customerId     = Form.getLookupId(formContext, Fields.CustomerId);
        var statusCode     = Form.getValue(formContext, Fields.StatusCode);
        var stateCode      = Form.getValue(formContext, Fields.StateCode);
        var estimatedClose = Form.getValue(formContext, Fields.EstimatedClose);
        var isDirty        = Form.isDirty(formContext);

        Debug.info(onSave.name, { saveMode: saveMode, statusCode: statusCode, isDirty: isDirty, customerId: customerId });

        if (saveMode === UI.SaveMode.AutoSave) return;

        // Form is read-only when Won or Lost — save should not reach this point
        if (stateCode === Options.StateCode.Won || stateCode === Options.StateCode.Lost) return;

        // Validate estimated close date
        if (estimatedClose !== null) {
            var closeDate = Util.toLocalMidnightDate(
                estimatedClose instanceof Date ? estimatedClose.toISOString() : estimatedClose
            );
            if (!closeDate) closeDate = estimatedClose instanceof Date ? estimatedClose : null;

            var today = new Date();
            today = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            if (closeDate && closeDate < today) {
                UI.preventSave(executionContext);
                UI.setFormNotification(
                    formContext,
                    'Estimated close date cannot be in the past.',
                    UI.NotificationLevel.Error,
                    Notif.ValidationWarn
                );
                return;
            }
        }

        UI.clearFormNotification(formContext, Notif.ValidationWarn);
    }

    // -------------------------------------------------------------------------
    // onEstimatedCloseDateChange — real-time warning, not a hard block
    // -------------------------------------------------------------------------

    /** @param {Xrm.Events.EventContext} executionContext */
    function onEstimatedCloseDateChange(executionContext) {
        var formContext    = executionContext.getFormContext();
        var estimatedClose = Form.getValue(formContext, Fields.EstimatedClose);

        if (!estimatedClose) {
            UI.clearFormNotification(formContext, Notif.ValidationWarn);
            return;
        }

        var closeDate = Util.toLocalMidnightDate(
            estimatedClose instanceof Date ? estimatedClose.toISOString() : estimatedClose
        );
        if (!closeDate) closeDate = estimatedClose instanceof Date ? estimatedClose : null;

        var today = new Date();
        today = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (closeDate && closeDate < today) {
            UI.setFormNotification(
                formContext,
                'Estimated close date is in the past — save will be blocked.',
                UI.NotificationLevel.Warning,
                Notif.ValidationWarn
            );
        } else {
            UI.clearFormNotification(formContext, Notif.ValidationWarn);
        }
    }

    // -------------------------------------------------------------------------
    // Demo: related data load — shows getLookupId + getRecord pattern
    // -------------------------------------------------------------------------

    async function _demoLoadRelatedData(formContext) {
        var customerId = Form.getLookupId(formContext, Fields.CustomerId);
        if (!customerId) return;

        var customerType = Form.getLookupEntityType(formContext, Fields.CustomerId);
        if (!customerType) return;

        var record = await WebApi.getRecord(customerType, customerId, 'name,statecode');
        Debug.info('_demoLoadRelatedData: customer', { name: record && record.name, statecode: record && record.statecode });
    }

    // -------------------------------------------------------------------------
    // Demo: associate / disassociate — full Opportunity ↔ Competitor lifecycle.
    // Wired to a dev-mode button injected below — not called on every onLoad.
    // Call Ops.Forms.Opportunity.demoAssociate(formContext) from the console to test.
    // -------------------------------------------------------------------------

    async function _demoAssociate(formContext) {
        var opportunityId = Form.getEntityId(formContext);
        if (!opportunityId) {
            Debug.warn('_demoAssociate: no opportunityId — save the record first');
            return;
        }

        Debug.info('_demoAssociate: creating demo competitor');

        // 1. Create a throwaway competitor record
        var competitorId = await WebApi.createRecord(
            Tables.Competitor.logicalName,
            { name: '_AssociateDemo' }
        );

        try {
            // 2. Associate: Opportunity → Competitor
            await WebApi.associate(
                Tables.Opportunity.entitySetName,
                opportunityId,
                Relationships.Opportunity.Competitors,
                Tables.Competitor.entitySetName,
                competitorId
            );
            Debug.info('_demoAssociate: associated');

            // 3. Query associated competitors via filter on _regardingobjectid_value
            var competitors = await WebApi.getRecords(
                Tables.Competitor.logicalName,
                '?$filter=_opportunityid_value eq ' + opportunityId + '&$select=name'
            );
            Debug.info('_demoAssociate: associated competitor count', { count: competitors.length });
        } finally {
            // 4. Disassociate and delete — no orphans
            try {
                await WebApi.disassociate(
                    Tables.Opportunity.entitySetName,
                    opportunityId,
                    Relationships.Opportunity.Competitors,
                    competitorId
                );
                Debug.info('_demoAssociate: disassociated');
            } catch (err) {
                Debug.warn('_demoAssociate: disassociate failed', err);
            }

            try {
                await WebApi.deleteRecord(Tables.Competitor.logicalName, competitorId);
                Debug.info('_demoAssociate: competitor deleted');
            } catch (err) {
                Debug.warn('_demoAssociate: competitor delete failed', err);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Public surface — event handler entry points + dev helpers
    // -------------------------------------------------------------------------

    return {
        onLoad:                       onLoad,
        onSave:                       onSave,
        onStatusCodeChange:           onStatusCodeChange,
        onEstimatedCloseDateChange:   onEstimatedCloseDateChange,
        demoAssociate:                _demoAssociate
    };
}());
