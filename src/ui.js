// ui.js — Ops.UI
// Form-level UX helpers: notifications, dialogs, tab navigation, progress, save mode.
// Mirrors the UX pattern rules from d365-ux-form-patterns.md.
//
// Key rules encoded here:
//   - setFormNotification always clears before setting (prevents stale double-notifications)
//   - setNotification is NOT called on web resource controls (silently fails in D365)
//   - All dialogs return Promises — caller can await
//   - Tab/control names are case-sensitive Name properties; wrong values fail silently
//
// Dependencies: Ops.Debug
// Load order: after debug.js

/* global Xrm */

var Ops = Ops || {};

Ops.UI = (function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Form notifications
    // -------------------------------------------------------------------------

    // Notification levels: 'ERROR' | 'WARNING' | 'INFO'
    var NotificationLevel = Object.freeze({ Error: 'ERROR', Warning: 'WARNING', Info: 'INFO' });

    /**
     * Sets a form-level notification. Always clears the same ID first to prevent stale duplicates.
     * Use a stable string constant for id — never a dynamic value that changes between calls.
     * @param {object} formContext
     * @param {string} message
     * @param {'ERROR'|'WARNING'|'INFO'} level - use Ops.UI.NotificationLevel.*
     * @param {string} id - stable string constant for this notification (see Ops.Constants.NotificationIds)
     * @example
     * Ops.UI.setFormNotification(formContext,
     *     'Account is inactive. Some fields are read-only.',
     *     Ops.UI.NotificationLevel.Warning,
     *     Ops.Constants.NotificationIds.PermissionWarn);
     */
    function setFormNotification(formContext, message, level, id) {
        formContext.ui.clearFormNotification(id);
        formContext.ui.setFormNotification(message, level || NotificationLevel.Info, id);
        Ops.Debug.verbose('setFormNotification [' + id + ']: ' + message);
    }

    function clearFormNotification(formContext, id) {
        formContext.ui.clearFormNotification(id);
    }

    /**
     * Sets a form notification that auto-clears after delayMs.
     * Optionally accepts a conditionFn that clears the notification early when it returns true.
     * @param {object} formContext
     * @param {string} message
     * @param {'ERROR'|'WARNING'|'INFO'} level
     * @param {string} id
     * @param {number} [delayMs=5000] - auto-clear delay in milliseconds
     * @param {Function} [conditionFn] - () => boolean, polled every 500ms; clears early if true
     * @example
     * // Auto-clears after 4 seconds, or immediately if the user fills in the required field:
     * Ops.UI.setTimedFormNotification(formContext, 'Name is required.', 'ERROR',
     *     Ops.Constants.NotificationIds.ValidationWarn, 4000,
     *     function() { return !Ops.Util.isNullOrEmpty(Ops.Form.getValue(formContext, 'name')); });
     */
    function setTimedFormNotification(formContext, message, level, id, delayMs, conditionFn) {
        setFormNotification(formContext, message, level, id);

        var cleared = false;
        function clear() {
            if (!cleared) {
                cleared = true;
                clearFormNotification(formContext, id);
            }
        }

        setTimeout(clear, delayMs || 5000);

        if (typeof conditionFn === 'function') {
            var poll = setInterval(function () {
                if (conditionFn()) {
                    clear();
                    clearInterval(poll);
                }
            }, 500);
            setTimeout(function () { clearInterval(poll); }, delayMs || 5000);
        }
    }

    // -------------------------------------------------------------------------
    // Dialogs — return Promises so callers can await
    // -------------------------------------------------------------------------

    /**
     * Opens a confirm dialog. Returns true if the user clicked Confirm, false otherwise.
     * @param {{ title: string, subtitle?: string, confirmButtonLabel?: string, cancelButtonLabel?: string, width?: number, height?: number }} options
     * @returns {Promise<boolean>}
     * @example
     * var confirmed = await Ops.UI.confirm({ title: 'Apply to all lines?', subtitle: 'This cannot be undone.' });
     * if (!confirmed) return;
     */
    function confirm(options) {
        return new Promise(function (resolve) {
            Xrm.Navigation.openConfirmDialog(
                {
                    title:              options.title || 'Confirm',
                    subtitle:           options.subtitle || '',
                    confirmButtonLabel: options.confirmButtonLabel || 'Confirm',
                    cancelButtonLabel:  options.cancelButtonLabel  || 'Cancel'
                },
                { width: options.width || 450, height: options.height || 250 }
            ).then(function (result) {
                resolve(result && result.confirmed === true);
            }).catch(function (err) {
                Ops.Debug.warn('confirm dialog error', err);
                resolve(false);
            });
        });
    }

    /**
     * Opens an alert dialog. Returns when the user dismisses it.
     * @param {{ title: string, confirmButtonLabel?: string, width?: number, height?: number }} options
     * @returns {Promise<void>}
     * @example
     * await Ops.UI.alert({ title: 'Save complete. The record has been updated.' });
     */
    function alert(options) {
        return Xrm.Navigation.openAlertDialog(
            {
                title:              options.title || '',
                confirmButtonLabel: options.confirmButtonLabel || 'OK'
            },
            { width: options.width || 450, height: options.height || 200 }
        ).catch(function (err) {
            Ops.Debug.warn('alert dialog error', err);
        });
    }

    // -------------------------------------------------------------------------
    // Tab / control navigation
    // -------------------------------------------------------------------------

    // Tab name is the case-sensitive Name property from the form editor — NOT the label.
    // Wrong name fails silently; a warning is logged so it surfaces during development.
    function navigateToTab(formContext, tabName) {
        var tab = formContext.ui.tabs.get(tabName);
        if (!tab) {
            Ops.Debug.warn('Ops.UI.navigateToTab: tab "' + tabName + '" not found — check case-sensitive Name property');
            return;
        }
        tab.setFocus();
        Ops.Debug.verbose('navigateToTab: ' + tabName);
    }

    // Sets focus on a control. controlName is the case-sensitive Name property.
    function setControlFocus(formContext, controlName) {
        var ctrl = formContext.getControl(controlName);
        if (!ctrl) {
            Ops.Debug.warn('Ops.UI.setControlFocus: control "' + controlName + '" not found');
            return;
        }
        ctrl.setFocus();
    }

    // Navigate to a tab and optionally focus a control within it.
    function navigateToControl(formContext, tabName, controlName) {
        navigateToTab(formContext, tabName);
        if (controlName) setControlFocus(formContext, controlName);
    }

    // -------------------------------------------------------------------------
    // Loading indicator
    // -------------------------------------------------------------------------

    function showProgress(message) {
        Xrm.Utility.showProgressIndicator(message || 'Loading...');
    }

    function hideProgress() {
        Xrm.Utility.closeProgressIndicator();
    }

    /**
     * Wraps an async operation with a progress indicator.
     * Shows on entry, hides in finally — safe even if the operation throws.
     * @param {Function} asyncFn - () => Promise
     * @param {string} [message]
     * @returns {Promise<*>}
     * @example
     * var result = await Ops.UI.withProgress(function() {
     *     return Ops.WebApi.getRecords('contact', '?$filter=statecode eq 0');
     * }, 'Loading contacts...');
     */
    async function withProgress(asyncFn, message) {
        showProgress(message);
        try {
            return await asyncFn();
        } finally {
            hideProgress();
        }
    }

    // -------------------------------------------------------------------------
    // Save mode helpers
    // -------------------------------------------------------------------------

    var SaveMode = Object.freeze({
        Save:              1,
        SaveAndClose:      2,
        SaveAndNew:        59,
        AutoSave:          70,
        SaveAsCompleted:   58,
        Deactivate:        5,
        Reactivate:        6,
        Send:              7,
        Disqualify:        15,
        Qualify:           16
    });

    // Returns the save mode integer from the onSave execution context.
    function getSaveMode(saveExecutionContext) {
        return saveExecutionContext.getEventArgs().getSaveMode();
    }

    /**
     * Prevents the save from completing. Use only in onSave for validation failures.
     * Always show a notification explaining why the save was blocked.
     * All validation state must be captured synchronously before any await — D365 does not
     * await onSave handlers, so the form context can go stale across an await boundary.
     * @param {object} saveExecutionContext
     */
    function preventSave(saveExecutionContext) {
        saveExecutionContext.getEventArgs().preventDefault();
        Ops.Debug.info('Ops.UI.preventSave: save blocked');
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        NotificationLevel:          NotificationLevel,
        setFormNotification:        setFormNotification,
        clearFormNotification:      clearFormNotification,
        setTimedFormNotification:   setTimedFormNotification,

        confirm:                    confirm,
        alert:                      alert,

        navigateToTab:              navigateToTab,
        setControlFocus:            setControlFocus,
        navigateToControl:          navigateToControl,

        showProgress:               showProgress,
        hideProgress:               hideProgress,
        withProgress:               withProgress,

        SaveMode:                   SaveMode,
        getSaveMode:                getSaveMode,
        preventSave:                preventSave
    };
}());
