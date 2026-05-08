// form.js — Ops.Form
// formContext helpers for D365 model-driven app form event handlers.
// Mirrors LocalPluginContext from the plugin base: safe access, guards, shortcuts.
//
// Design rules:
//   - All methods accept formContext as the first argument — no module-level state
//   - Return null / false / '' on missing or unavailable values — never throw for absent fields
//   - addOnChange always removes before adding — prevents stacked handlers on repeated onLoad
//   - Never cache formContext across event calls — capture it fresh from executionContext
//
// Dependencies: Ops.Debug, Ops.Util
// Load order: after debug.js, util.js

var Ops = Ops || {};

Ops.Form = (function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Attribute access — mirrors LocalPluginContext.GetTarget / GetAttributeValue
    // -------------------------------------------------------------------------

    // Returns the attribute object or null. Never throws.
    function getAttribute(formContext, name) {
        try {
            var attr = formContext && formContext.getAttribute(name);
            return attr || null;
        } catch (e) {
            Ops.Debug.warn('Ops.Form.getAttribute: failed for "' + name + '"', e);
            return null;
        }
    }

    /**
     * Returns the attribute value or null. Mirror of entity.GetAttributeValue<T>.
     * Safe — returns null if the attribute is absent from the form (no throw).
     * @param {object} formContext
     * @param {string} name - attribute logical name
     * @returns {*}
     * @example
     * var status = Ops.Form.getValue(formContext, Fields.StatusCode);
     * // null-safe: returns null if statuscode is not on this form
     */
    function getValue(formContext, name) {
        var attr = getAttribute(formContext, name);
        return attr !== null ? attr.getValue() : null;
    }

    // Sets the attribute value. No-op if attribute is absent (avoids silent TypeError).
    // Note: setValue does NOT trigger onChange. Call Ops.Form.fireOnChange() if needed.
    function setValue(formContext, name, value) {
        var attr = getAttribute(formContext, name);
        if (attr) attr.setValue(value);
    }

    // Returns true if the attribute is present AND its current value differs from compareValue.
    function hasChangedFrom(formContext, name, compareValue) {
        var current = getValue(formContext, name);
        return current !== compareValue;
    }

    // -------------------------------------------------------------------------
    // Lookup helpers — mirrors EntityReference access patterns
    // -------------------------------------------------------------------------

    /**
     * Returns the first lookup value object, or null.
     * D365 lookup attributes return an array — this unwraps the first item.
     * @param {object} formContext
     * @param {string} name - lookup attribute logical name
     * @returns {{ id: string, entityType: string, name: string }|null}
     * @example
     * var contact = Ops.Form.getLookupValue(formContext, Fields.PrimaryContact);
     * // → { id: 'guid...', entityType: 'contact', name: 'Jane Smith' }
     * // → null if field is empty or absent from the form
     */
    function getLookupValue(formContext, name) {
        var val = getValue(formContext, name);
        return (val && val.length > 0) ? val[0] : null;
    }

    // Returns the normalized GUID of the first lookup value, or null.
    function getLookupId(formContext, name) {
        var lv = getLookupValue(formContext, name);
        return lv ? Ops.Util.normalizeGuid(lv.id) : null;
    }

    // Returns the entity logical name of the first lookup value, or null.
    function getLookupEntityType(formContext, name) {
        var lv = getLookupValue(formContext, name);
        return lv ? lv.entityType : null;
    }

    /**
     * Sets a lookup attribute. Pass null to clear.
     * Wraps the value in an array — D365 lookup attributes expect an array.
     * @param {object} formContext
     * @param {string} name - lookup attribute logical name
     * @param {{ id: string, entityType: string, name: string }|null} lookupItem
     * @example
     * // Set:
     * Ops.Form.setLookupValue(formContext, Fields.PrimaryContact,
     *     { id: contactId, entityType: 'contact', name: 'Jane Smith' });
     *
     * // Clear:
     * Ops.Form.setLookupValue(formContext, Fields.PrimaryContact, null);
     */
    function setLookupValue(formContext, name, lookupItem) {
        setValue(formContext, name, lookupItem ? [lookupItem] : null);
    }

    // -------------------------------------------------------------------------
    // Field state — setRequired / setVisible / setDisabled
    // -------------------------------------------------------------------------

    // 'required' | 'recommended' | 'none'
    function setRequired(formContext, name, required) {
        var attr = getAttribute(formContext, name);
        if (attr) attr.setRequiredLevel(required ? 'required' : 'none');
    }

    // Hides or shows the control for a field.
    function setVisible(formContext, name, visible) {
        var ctrl = getControl(formContext, name);
        if (ctrl) ctrl.setVisible(visible);
    }

    // Disables or enables the control for a field.
    function setDisabled(formContext, name, disabled) {
        var ctrl = getControl(formContext, name);
        if (ctrl) ctrl.setDisabled(disabled);
    }

    /**
     * Applies multiple field-state changes in a single call.
     * Each entry can set required, visible, and/or disabled independently.
     * @param {object} formContext
     * @param {Array<{name: string, required?: boolean, visible?: boolean, disabled?: boolean}>} fieldStates
     * @example
     * Ops.Form.applyFieldStates(formContext, [
     *     { name: Fields.Amount,  disabled: true,  required: false },
     *     { name: Fields.DueDate, visible: false }
     * ]);
     */
    function applyFieldStates(formContext, fieldStates) {
        fieldStates.forEach(function (fs) {
            if (fs.required !== undefined) setRequired(formContext, fs.name, fs.required);
            if (fs.visible  !== undefined) setVisible(formContext, fs.name, fs.visible);
            if (fs.disabled !== undefined) setDisabled(formContext, fs.name, fs.disabled);
        });
    }

    // -------------------------------------------------------------------------
    // Control access
    // -------------------------------------------------------------------------

    // Returns the control or null. Control names are case-sensitive Name properties.
    function getControl(formContext, name) {
        try {
            var ctrl = formContext && formContext.getControl(name);
            return ctrl || null;
        } catch (e) {
            Ops.Debug.warn('Ops.Form.getControl: failed for "' + name + '"', e);
            return null;
        }
    }

    // Adds an option to an optionset control's filtered list.
    function addOptionSetOption(formContext, name, value) {
        var ctrl = getControl(formContext, name);
        if (ctrl && ctrl.addOption) ctrl.addOption({ text: '', value: value });
    }

    // Removes a single option from an optionset control.
    function removeOption(formContext, name, value) {
        var ctrl = getControl(formContext, name);
        if (ctrl && ctrl.removeOption) ctrl.removeOption(value);
    }

    // -------------------------------------------------------------------------
    // onChange — always remove-then-add to prevent stacked handlers on repeated onLoad
    // -------------------------------------------------------------------------

    /**
     * Registers a named function as an onChange handler. Removes first to prevent stacking.
     * D365 fires onLoad again on tab navigation — without remove-then-add, handlers stack.
     * @param {object} formContext
     * @param {string} name - attribute logical name
     * @param {Function} handler - MUST be a named function reference, not an anonymous wrapper.
     *   Anonymous functions cannot be passed to removeOnChange — they stack silently.
     * @example
     * // Correct — named function reference:
     * Ops.Form.addOnChange(formContext, Fields.StatusCode, onStatusCodeChange);
     *
     * // Wrong — anonymous wrapper can never be removed:
     * formContext.getAttribute('statuscode').addOnChange(function(ctx) { ... });
     */
    function addOnChange(formContext, name, handler) {
        var attr = getAttribute(formContext, name);
        if (!attr) return;
        attr.removeOnChange(handler);
        attr.addOnChange(handler);
    }

    function removeOnChange(formContext, name, handler) {
        var attr = getAttribute(formContext, name);
        if (attr) attr.removeOnChange(handler);
    }

    /**
     * Manually fires onChange. Required after setValue() — setValue does NOT trigger onChange.
     * @param {object} formContext
     * @param {string} name
     * @example
     * Ops.Form.setValue(formContext, Fields.StatusCode, 2);
     * Ops.Form.fireOnChange(formContext, Fields.StatusCode); // downstream handlers now see the new value
     */
    function fireOnChange(formContext, name) {
        var attr = getAttribute(formContext, name);
        if (attr) attr.fireOnChange();
    }

    // -------------------------------------------------------------------------
    // Form identity — mirrors LocalPluginContext PrimaryEntityName, PrimaryEntityId
    // -------------------------------------------------------------------------

    function getEntityId(formContext) {
        return Ops.Util.normalizeGuid(formContext.data.entity.getId());
    }

    function getEntityName(formContext) {
        return formContext.data.entity.getEntityName();
    }

    // Form type codes: 1=Create, 2=Update, 3=ReadOnly, 4=Disabled, 6=BulkEdit
    function getFormType(formContext) {
        return formContext.ui.getFormType();
    }

    function isCreateForm(formContext) { return getFormType(formContext) === 1; }
    function isUpdateForm(formContext) { return getFormType(formContext) === 2; }

    // -------------------------------------------------------------------------
    // Dirty state
    // -------------------------------------------------------------------------

    // Returns true if any attribute in the form has unsaved changes.
    function isDirty(formContext) {
        return formContext.data.entity.getIsDirty();
    }

    // Returns true if the specific attribute has an unsaved change.
    function isAttributeDirty(formContext, name) {
        var attr = getAttribute(formContext, name);
        return attr ? attr.getIsDirty() : false;
    }

    // -------------------------------------------------------------------------
    // Tab/section helpers
    // -------------------------------------------------------------------------

    function getTab(formContext, tabName) {
        try {
            return formContext.ui.tabs.get(tabName) || null;
        } catch (e) {
            Ops.Debug.warn('Ops.Form.getTab: failed for "' + tabName + '"', e);
            return null;
        }
    }

    function setTabVisible(formContext, tabName, visible) {
        var tab = getTab(formContext, tabName);
        if (tab) tab.setVisible(visible);
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        getAttribute:       getAttribute,
        getValue:           getValue,
        setValue:           setValue,
        hasChangedFrom:     hasChangedFrom,

        getLookupValue:     getLookupValue,
        getLookupId:        getLookupId,
        getLookupEntityType: getLookupEntityType,
        setLookupValue:     setLookupValue,

        setRequired:        setRequired,
        setVisible:         setVisible,
        setDisabled:        setDisabled,
        applyFieldStates:   applyFieldStates,

        getControl:         getControl,
        addOptionSetOption: addOptionSetOption,
        removeOption:       removeOption,

        addOnChange:        addOnChange,
        removeOnChange:     removeOnChange,
        fireOnChange:       fireOnChange,

        getEntityId:        getEntityId,
        getEntityName:      getEntityName,
        getFormType:        getFormType,
        isCreateForm:       isCreateForm,
        isUpdateForm:       isUpdateForm,

        isDirty:            isDirty,
        isAttributeDirty:   isAttributeDirty,

        getTab:             getTab,
        setTabVisible:      setTabVisible
    };
}());
