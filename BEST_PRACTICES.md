# D365 Web Resource Best Practices

This base mirrors the discipline from `Ops.Plugins` on the server side. These rules apply across all `Ops.Forms.*`, `Ops.WebApi`, `Ops.Form`, `Ops.UI`, `Ops.Debug`, and `Ops.Util` code.

---

## Namespace and file organization

- Use `var Ops = Ops || {};` at the top of every file — never assign directly to `Ops = {}`.
- Each module is an IIFE that returns its public surface. Internal helpers stay private.
- Namespace mirrors the plugin base: `Ops.Forms.Account` ↔ `Ops.Plugins.AccountUpdatePlugin`.
- One file per form handler: `Ops.Account.form.js`, `Ops.Contact.form.js`, etc.
- Utility files (`ops.debug.js`, `ops.webapi.js`, etc.) are shared across all form handlers. Register them as web resource dependencies in the form editor.
- Naming convention for web resources: `ops_<module>.js` — matches D365 publisher prefix conventions.

---

## Async rules — async/await exclusively

- All API calls use `async/await`. Never mix callbacks and Promises in the same call chain.
- Event handlers (`onLoad`, `onChange`, `onSave`) are NOT awaited by D365. Async work inside them is fire-and-forget — always attach `.catch()`.
- `onSave` special case: capture all synchronous state (`getValue`, `getIsDirty`, save mode) **before** any `await`. The form context can become stale after an await boundary.
- Use `Ops.Util.singleFlight(asyncFn)` on confirm/submit handlers to prevent double-submission.
- Never use `XMLHttpRequest` synchronously. It is deprecated and blocks the UI thread.

```javascript
// CORRECT — onLoad fire-and-forget
async function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    await _initializeForm(formContext); // internal await is fine
}

// CORRECT — onChange fire-and-forget with error catch
function onStatusCodeChange(executionContext) {
    var formContext = executionContext.getFormContext();
    _handleStatusChange(formContext).catch(function (err) {
        Ops.Debug.critical('onStatusCodeChange error', err);
    });
}

// CORRECT — onSave: synchronous capture, no async
function onSave(executionContext) {
    var name = Ops.Form.getValue(executionContext.getFormContext(), 'name'); // sync
    if (!name) {
        Ops.UI.preventSave(executionContext); // sync
        return;
    }
}
```

---

## Handler registration — addOnChange guard

Always remove before adding. D365 fires `onLoad` on tab navigate — handlers stack silently without this guard.

```javascript
// CORRECT — named function reference + remove-then-add
Ops.Form.addOnChange(formContext, 'statuscode', onStatusCodeChange);

// WRONG — anonymous wrapper can never be removed
formContext.getAttribute('statuscode').addOnChange(function (ctx) { ... });
```

`Ops.Form.addOnChange` enforces this pattern. Pass a named function reference, never an inline anonymous function.

After `setValue()` on an attribute, call `Ops.Form.fireOnChange()` if downstream handlers must react — `setValue()` does NOT trigger `onChange` automatically.

---

## Web API

- Use `Ops.WebApi.*` — never call `Xrm.WebApi` directly in form scripts.
- Always `$select` the columns you need. Avoid selecting all columns in production.
- Never call Web API in an `onSave` handler synchronously. Use post-save fire-and-forget or a separate async flow.
- For multi-operation writes, use `Ops.WebApi.batch()` to keep them atomic.
- Retry is opt-in: pass `maxRetries` to `_execute` when transient failures are expected (e.g., large-scale bulk operations).

```javascript
// CORRECT — targeted $select
var account = await Ops.WebApi.getRecord('account', id, 'name,accountnumber,statuscode');

// WRONG — selects all columns, slow on large records
var account = await Ops.WebApi.getRecord('account', id);
```

---

## Constants — never hardcode logical names or option set integers

Mirror of the plugin base rule: use `Messages.*`, `ParameterNames.*`, `EntityOptionSetEnum`.

```javascript
// CORRECT
var status = Ops.Form.getValue(formContext, Ops.Constants.Fields.Account.StatusCode);
if (status === Ops.Constants.OptionSets.Account.StatusCode.Active) { ... }

// WRONG — fragile, breaks on org migration or publisher prefix change
if (formContext.getAttribute('statuscode').getValue() === 1) { ... }
```

For undocumented option set values, derive them at runtime via label match (see D365 guidance). Never hardcode integers you cannot verify.

---

## formContext rules

- Never store `formContext` or `executionContext` at module level. Capture it fresh in every event handler from `executionContext.getFormContext()`.
- Use `Ops.Form.*` helpers — they null-check before calling into the API. Calling `getAttribute()` on a missing field returns null without throwing.
- Tab and control names are **case-sensitive Name properties** from the form editor — not display labels. Wrong values fail silently.

---

## Debug and logging

- Use `Ops.Debug.*` throughout — not `console.*` directly.
- Set a prefix at the top of each form handler module: `Ops.Debug.setPrefix('Account.form')`.
- Default level is `Info`. Bump to `Verbose` in a browser console session for full trace: `Ops.Debug.setLevel(Ops.Debug.Level.Verbose)`.
- Export the in-memory log for support tickets: `Ops.Debug.exportJson()`.
- In production, `Verbose` log lines cost nothing when level is `Info` — use the lazy factory overload for expensive messages:

```javascript
Ops.Debug.verbose(function () {
    return 'Processing ' + records.length + ' records: ' + JSON.stringify(records);
});
```

---

## jQuery and Knockout strategy

### jQuery

jQuery is not a dependency of the `Ops.*` utility layer. Do not import it into utility files.

If your solution has jQuery-dependent legacy web resources:
1. Do not add jQuery calls to new `Ops.Forms.*` handlers.
2. Wrap legacy jQuery interactions behind an `Ops.Legacy.*` module if they must be called from new code.
3. Eliminate jQuery usage incrementally as forms are migrated — replace with `fetch`, `Xrm.WebApi`, and native DOM APIs.

### Knockout

Knockout-based HTML web resources (KO MVVM grids) are a separate execution context from form scripts. Rules:
- Do not import KO into `Ops.Forms.*` form handlers.
- Communicate from form JS to iframe KO via `parent.Xrm.Page` (iframe reads parent state; form JS cannot call iframe functions directly).
- In KO viewmodels, use `Ops.Debug`, `Ops.Util`, and `Ops.WebApi` as standalone utilities — they have no Knockout dependency and load cleanly inside iframe contexts.
- Use named function references on `addOnChange` even from inside KO viewmodels — anonymous wrappers cannot be removed.

---

## Notifications

- Use `Ops.UI.setFormNotification` (not `setNotification` on controls). `setNotification` on web resource controls silently fails in D365.
- Always clear a notification id before re-setting: `Ops.UI.setFormNotification` does this automatically.
- Use stable string constants from `Ops.Constants.NotificationIds` — not ad-hoc strings.
- Auto-dismiss via timer is a safety net. Prefer clearing on condition-resolved: the next handler that can change the condition calls `clearFormNotification` before returning.

---

## onSave edge cases

- `onSave` fires for all save modes (Save, SaveAndClose, AutoSave, etc.). Check `Ops.UI.getSaveMode()` when the behavior differs by mode.
- `Ops.UI.preventSave()` blocks the save — use for validation failures only. Always show a notification explaining why the save was blocked.
- AutoSave (mode 70) fires every 30 seconds when enabled on the form. If your `onSave` makes API calls, guard against AutoSave triggering them unintentionally.

```javascript
function onSave(executionContext) {
    if (Ops.UI.getSaveMode(executionContext) === Ops.UI.SaveMode.AutoSave) return; // skip heavy logic
    // ... validation
}
```

---

## Anti-patterns to avoid

| Anti-Pattern | Problem | Fix |
|---|---|---|
| `XMLHttpRequest` synchronously | Blocks UI thread, deprecated | `Ops.WebApi.*` with async/await |
| `Xrm.Page.*` | Deprecated, removed in model-driven apps | `formContext.*` from executionContext |
| `$.ajax()` or jQuery in utilities | Adds jQuery dependency, deprecated transport | `Ops.WebApi.*` / `fetch` |
| `OData v2` (`/XRMServices/2011/…`) | Deprecated endpoint | Web API v9.2 via `Ops.WebApi.*` |
| Anonymous functions on `addOnChange` | Cannot be removed — handlers stack | Named function references |
| `setValue()` and expecting onChange to fire | Does NOT trigger — silent no-op | Call `fireOnChange()` after `setValue()` |
| `setNotification` on web resource control | Silently fails in D365 | `setFormNotification` on formContext |
| Hardcoded option set integers | Breaks on org migration | `Ops.Constants.OptionSets.*` |
| `formContext` stored at module level | Stale reference across events | Capture fresh from executionContext |
| Awaiting inside onSave before preventSave | Save completes before await resolves | All validation synchronous |
| `ColumnSet(true)` equivalent (no `$select`) | Slow, over-fetches | Always `$select` required columns |
| Direct DOM manipulation in form scripts | Unsupported, breaks on form refresh | Use `formContext` API only |
| Global state between form handlers | Race conditions on multi-form pages | Keep state local to each module |

---

## Load order for web resources

Register dependencies in this order in the form editor:

1. `debug.js` → upload as `ops_debug.js`
2. `util.js` → upload as `ops_util.js`
3. `webapi.js` → upload as `ops_webapi.js`
4. `form.js` → upload as `ops_form.js`
5. `ui.js` → upload as `ops_ui.js`
6. `constants.js` → upload as `ops_constants.js`
7. `account.form.js` (or whichever form handler)

## Form editor events — onLoad only

Register only `onLoad` in the form editor. All other handlers (`onChange`, `onSave`) are
wired dynamically inside `_wireHandlers()` using `addOnChange` and `addOnSave`.

| Event | Handler | Pass execution context |
|-------|---------|------------------------|
| `onLoad` | `Ops.Forms.Account.onLoad` | Yes |

`addOnChange` and `addOnSave` use remove-then-add internally — no handler stacking on re-load.

---

## Microsoft references

- [Xrm.WebApi](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/xrm-webapi)
- [formContext](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/formcontext-data-entity)
- [Client API reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference)
- [Web API query data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-data-web-api)
- [Deprecated client API](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/deprecated-apis)
