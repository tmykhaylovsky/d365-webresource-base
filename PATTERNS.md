# D365 Web Resource Patterns

Cookbook-style reference for common and advanced implementation patterns using the `Ops.*` utility layer.
`BEST_PRACTICES.md` covers rules (what NOT to do). This file covers patterns (how to do things well).

---

## Pattern 1 — Form initialization on load

The canonical onLoad flow: wire handlers, skip data work on create forms, guard errors.

```javascript
async function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    Ops.Debug.info('onLoad', { formType: Ops.Form.getFormType(formContext) });

    // Top-level catch: any uncaught throw (sync or async) lands in the Debug log.
    // Non-blocking sub-operations keep their own catches so one failure doesn't abort the rest.
    try {
        _wireHandlers(formContext);     // wire all onChange + onSave before any await
        await _initializeForm(formContext);
    } catch (err) {
        Ops.Debug.critical('onLoad failed', err);
    }
}

function _wireHandlers(formContext) {
    Ops.Form.addOnChange(formContext, Fields.StatusCode, onStatusCodeChange);
    formContext.data.entity.removeOnSave(onSave);
    formContext.data.entity.addOnSave(onSave);
}

async function _initializeForm(formContext) {
    if (Ops.Form.isCreateForm(formContext)) return;  // no record = no data to load
    try {
        await _applyStatusDrivenState(formContext);
    } catch (err) {
        Ops.Debug.critical('_initializeForm failed', err);
        Ops.UI.setFormNotification(formContext,
            'Error loading form state. Refresh and try again.',
            Ops.UI.NotificationLevel.Warning, Notif.LoadError);
    }
}
```

---

## Pattern 2 — Status-driven field state

Apply field visibility/disabled state based on an option set field. Clear the notification
when the status is back to active.

```javascript
async function _applyStatusDrivenState(formContext) {
    var status = Ops.Form.getValue(formContext, Fields.StatusCode);
    var isActive = status === Options.StatusCode.Active;

    Ops.Form.applyFieldStates(formContext, [
        { name: Fields.Amount,   disabled: !isActive },
        { name: Fields.DueDate,  disabled: !isActive, required: isActive }
    ]);

    if (!isActive) {
        Ops.UI.setFormNotification(formContext,
            'Record is inactive. Some fields are read-only.',
            Ops.UI.NotificationLevel.Warning, Notif.PermissionWarn);
    } else {
        Ops.UI.clearFormNotification(formContext, Notif.PermissionWarn);
    }
}

// Wire to onChange — fires on user action and programmatic setValue + fireOnChange
function onStatusCodeChange(executionContext) {
    var formContext = executionContext.getFormContext();
    _applyStatusDrivenState(formContext).catch(function(err) {
        Ops.Debug.critical('onStatusCodeChange error', err);
    });
}
```

---

## Pattern 3 — onSave validation (synchronous, no async)

All validation state must be captured synchronously. The save completes before any await
resolves — capturing values after an await gives stale data.

```javascript
function onSave(executionContext) {
    var formContext = executionContext.getFormContext();
    var saveMode    = Ops.UI.getSaveMode(executionContext);

    if (saveMode === Ops.UI.SaveMode.AutoSave) return;  // skip validation on autosave

    // Capture everything synchronously — formContext is stale after any await
    var name    = Ops.Form.getValue(formContext, Fields.Name);
    var amount  = Ops.Form.getValue(formContext, Fields.Amount);
    var closeDate = Ops.Form.getValue(formContext, Fields.CloseDate);

    if (Ops.Util.isNullOrEmpty(name)) {
        Ops.UI.preventSave(executionContext);
        Ops.UI.setFormNotification(formContext, 'Name is required.',
            Ops.UI.NotificationLevel.Error, Notif.ValidationWarn);
        return;
    }

    if (amount <= 0) {
        Ops.UI.preventSave(executionContext);
        Ops.UI.setFormNotification(formContext, 'Amount must be greater than zero.',
            Ops.UI.NotificationLevel.Error, Notif.ValidationWarn);
        return;
    }

    Ops.UI.clearFormNotification(formContext, Notif.ValidationWarn);

    // Fire-and-forget async post-save work (does not block the save):
    // _doPostSaveAsync(formContext).catch(function(err) { Ops.Debug.critical('post-save error', err); });
}
```

---

## Pattern 4 — Fluent query vs. raw OData string

Both forms call the same transport layer (`Xrm.WebApi.retrieveMultipleRecords`).
Use fluent for readability, raw string for complex OData the builder doesn't cover.

```javascript
// Fluent — readable, maintainable
var contacts = await Ops.WebApi.query('contact')
    .select('fullname', 'statuscode', 'emailaddress1')
    .where('_parentcustomerid_value eq ' + accountId)
    .where('statecode eq 0')        // multiple .where() calls join with 'and'
    .orderBy('fullname')
    .top(25)
    .getAll();

// Raw string — use when you need nested $expand or complex OData functions
var contacts = await Ops.WebApi.getRecords('contact',
    '?$select=fullname,statuscode&$filter=parentcustomerid/accountid eq ' + accountId +
    ' and statecode eq 0&$orderby=fullname&$top=25');

// getFirst() — single record lookup
var owner = await Ops.WebApi.query('systemuser')
    .select('fullname', 'internalemailaddress')
    .where("systemuserid eq " + ownerId)
    .getFirst();   // returns the record or null — no array unwrap needed
```

---

## Pattern 5 — Deduplicating concurrent lookups

When N callers (e.g., grid rows building a display) all request the same record, share one
pending Promise instead of firing N concurrent API calls.

```javascript
// Module-level result cache for resolved values (persists across calls)
var _nameCache = {};

function getCompetitorName(competitorId) {
    // Return cached value if already resolved
    if (_nameCache[competitorId] !== undefined) {
        return Promise.resolve(_nameCache[competitorId]);
    }

    // Ops.Util.dedupe shares one in-flight Promise for the same key
    return Ops.Util.dedupe('competitor-' + competitorId, function() {
        return Ops.WebApi.getRecord('competitor', competitorId, 'name')
            .then(function(record) {
                _nameCache[competitorId] = record ? record.name : '';
                return _nameCache[competitorId];
            });
    });
}
```

---

## Pattern 6 — Confirm → async operation → notify

User confirmation, async work with progress indicator, success/failure notification.

```javascript
var _applyChanges = Ops.Util.singleFlight(async function(formContext) {
    var confirmed = await Ops.UI.confirm({
        title:   'Apply changes to all lines?',
        subtitle: 'This will update ' + _selectedCount() + ' line(s).'
    });
    if (!confirmed) return;

    var result = await Ops.UI.withProgress(async function() {
        return _saveAllLines(formContext);
    }, 'Saving...');

    if (result.errors.length > 0) {
        Ops.UI.setFormNotification(formContext,
            result.errors.length + ' line(s) failed to save. Check the log.',
            Ops.UI.NotificationLevel.Warning, Notif.SaveError);
    } else {
        Ops.UI.setTimedFormNotification(formContext,
            'All lines saved successfully.',
            Ops.UI.NotificationLevel.Info, Notif.NavStatus, 4000);
    }
});
```

`singleFlight` prevents double-submit if the button is clicked twice before the first
confirm dialog opens.

---

## Pattern 7 — Atomic multi-record write via $batch

When two or more records must be written atomically (all succeed or all fail):

```javascript
async function _deactivateBatch(ids) {
    var parts = ids.map(function(id) {
        return {
            method: 'PATCH',
            url: 'accounts(' + id + ')',
            body: { statecode: 1, statuscode: 2 }
        };
    });

    try {
        await Ops.WebApi.batch(parts);
        Ops.Debug.info('_deactivateBatch: ' + ids.length + ' record(s) deactivated');
    } catch (err) {
        Ops.Debug.critical('_deactivateBatch failed', err);
        throw err;  // re-throw so the caller can show a notification
    }
}
```

---

## Pattern 8 — Lookup set + fireOnChange chain

`setValue` on a lookup does NOT trigger `onChange`. Use `fireOnChange` to propagate the
change to downstream handlers.

```javascript
async function _setOwnerFromContact(formContext, contactId) {
    var contact = await Ops.WebApi.getRecord('contact', contactId, 'fullname,ownerid');
    if (!contact) return;

    Ops.Form.setLookupValue(formContext, Fields.OwnerId, {
        id:         contact['_ownerid_value'],
        entityType: contact['_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'],
        name:       contact['_ownerid_value@OData.Community.Display.V1.FormattedValue']
    });

    // Without this, any onChange handler on ownerid will NOT see the new value:
    Ops.Form.fireOnChange(formContext, Fields.OwnerId);
}
```

---

## Pattern 9 — Tab navigation after status change

Auto-navigate to a related tab when the status change has one unambiguous destination.
Skip navigation if the user set an unrelated status.

```javascript
var NAVIGATE_ON_STATUS = [
    Options.StatusCode.POReceived,
    Options.StatusCode.VerbalOrder
];

function onStatusCodeChange(executionContext) {
    var formContext = executionContext.getFormContext();
    var status = Ops.Form.getValue(formContext, Fields.StatusCode);
    Ops.Debug.info('onStatusCodeChange', { status: status });

    if (NAVIGATE_ON_STATUS.indexOf(status) !== -1) {
        Ops.UI.navigateToControl(
            formContext,
            Ops.Constants.FormControls.Opportunity.Tabs.ProductLineItems,
            Ops.Constants.FormControls.Opportunity.Controls.ProductGrid
        );
        Ops.UI.setTimedFormNotification(formContext,
            'Navigated to Product Line Items.',
            Ops.UI.NotificationLevel.Info, Notif.NavStatus, 4000);
    }

    _applyStatusDrivenState(formContext).catch(function(err) {
        Ops.Debug.critical('onStatusCodeChange error', err);
    });
}
```

---

## Pattern 10 — Debug panel usage

The `ops.debug.panel.html` web resource can be registered on any form in a collapsible
section. For production forms, collapse the section by default or hide it — the web
resource remains registered and reappears when the section is expanded or restored.

From the panel, developers can:
- Copy the full log to clipboard (bypasses the need to know the DevTools console path)
- Toggle between Info and Verbose level
- See the last 20 log lines live in the panel preview

---

## Pattern 11 — Function.name for refactor-safe log labels

JavaScript named function declarations expose their name via `Function.name`. Use it instead
of hardcoded strings in `Debug.*` calls so log labels stay accurate through renames.

```javascript
async function _loadSupplementalData(formContext) {
    try {
        // ...
        Debug.verbose(_loadSupplementalData.name + ': ' + contacts.length + ' contact(s)');
    } catch (err) {
        Debug.warn(_loadSupplementalData.name + ' failed — non-blocking', err);
    }
}

function onStatusCodeChange(executionContext) {
    Debug.info(onStatusCodeChange.name, { statusCode: statusCode });
    _applyState(formContext).catch(function (err) {
        Debug.critical(onStatusCodeChange.name + ' async error', err);
    });
}
```

**Applies to:** any named function declaration. Does NOT work on anonymous functions or arrow
functions assigned to variables — those yield `''` or the variable name depending on the engine.
All form event handlers and `_privateHelpers` in this repo are named declarations, so the
pattern applies everywhere.

---

## Pattern 10 — Debug panel usage

From the DevTools console directly:
```javascript
Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
Ops.Debug.printTable();      // structured table view
Ops.Debug.copyToClipboard(); // raw JSON — paste into any text editor
Ops.Debug.exportJson();      // view inline
```
