# d365-webresource-base

Production-grade starter for Microsoft Dynamics 365 / Dataverse client-side web resources: form scripts, HTML web resources, and shared utility layers.

Companion to [d365-plugin-base](https://github.com/tmykhaylovsky/d365-plugin-base). Mirrors its discipline (namespacing, logging, typed access, central constants) on the client side.

---

## What this is

A structured, opinionated base for modernizing or greenfielding D365 web resource JavaScript:

- Replaces `Xrm.Page` (deprecated) with `formContext` patterns
- Replaces `XMLHttpRequest` / OData v2 with `Xrm.WebApi` async/await
- Replaces scattered `console.log` with a level-gated, exportable logger
- Replaces inline magic strings with typed constants

**Not a framework.** These are plain JavaScript files with no build step, no bundler, and no runtime dependencies. They load as D365 web resources.

---

## Module map

| File | Module | Mirrors (plugin base) |
|------|--------|-----------------------|
| `src/debug.js` | `Ops.Debug` | `PluginLogger` |
| `src/util.js` | `Ops.Util` | `CrmFormat`, `EntityExtensions` |
| `src/webapi.js` | `Ops.WebApi` | `OrganizationServiceExtensions` |
| `src/form.js` | `Ops.Form` | `LocalPluginContext` |
| `src/ui.js` | `Ops.UI` | — (client-only) |
| `src/constants.js` | `Ops.Constants` | `Messages`, `Fields.*`, `EntityOptionSetEnum` |
| `src/forms/account.form.js` | `Ops.Forms.Account` | `AccountUpdatePlugin` |
| `src/html/ops.debug.panel.html` | — | Debug panel web resource |

---

## Quickstart

### 0. Install dev tooling (optional but recommended)

```bash
npm install          # installs @types/xrm for Xrm.* IntelliSense in VS Code
```

`jsconfig.json` is already configured. Open any `src/*.js` file in VS Code and IntelliSense
activates for `Xrm.WebApi`, `Xrm.Navigation`, `formContext`, etc.

### 1. Copy the utility files into your solution

Upload each `src/*.js` as a separate web resource with your publisher prefix:

```
ops_debug.js
ops_util.js
ops_webapi.js
ops_form.js
ops_ui.js
ops_constants.js
```

For one-click publish from VS Code: install the
[Web Resources Updater](https://marketplace.visualstudio.com/items?itemName=MaratVDeykun.MicrosoftDynamicsCRMWebResourcesUpdater)
extension and connect it to your dev environment.

### 2. Populate `ops_constants.js` with your solution's tables, fields, and option sets

```javascript
var Fields = Object.freeze({
    MyTable: Object.freeze({
        MyField: 'ops_myfield'
    })
});
```

### 3. Create a form handler for each entity

Copy `src/forms/Ops.Account.form.js`, rename the module to `Ops.Forms.MyEntity`, and register it on your form with the utility files as dependencies.

### 4. Register events in the form editor

Only one entry is needed — all other handlers are wired dynamically from `onLoad`:

| Event | Handler | Pass execution context |
|-------|---------|------------------------|
| `onLoad` | `Ops.Forms.Account.onLoad` | Yes |

`onChange` and `onSave` are registered dynamically inside `_wireHandlers()`. No additional
form editor entries are required.

### 5. Set the load order

In the form editor dependencies, load utility files before form handlers (see `BEST_PRACTICES.md` → Load order).

---

## Debugging in the browser

```javascript
// In DevTools console on any D365 page with the web resources loaded:

Ops.Debug.setLevel(Ops.Debug.Level.Verbose);    // enable full trace
Ops.Debug.printTable();                          // view log as table
Ops.Debug.exportJson();                          // copy to clipboard / paste to ticket
Ops.Debug.copyToClipboard();                     // auto-copy to clipboard
```

---

## Design decisions

**Async/await exclusively.** No callbacks, no mixed Promise chains. All `Ops.WebApi.*` methods return Promises. Event handlers fire-and-forget async work with `.catch()` attached.

**Fluent query builder and raw strings coexist.** `Ops.WebApi.query('account').select(...).where(...).top(10).getAll()` is a thin builder over `getRecords()` — same transport, no new layer. Use the fluent form for readable code, the raw string form for complex OData the builder doesn't cover.

**No module bundler.** Files load as individual web resources. The IIFE + namespace-merge pattern (`var Ops = Ops || {}`) handles cross-file dependencies without a build step. Add a bundler if your workflow supports it — the pattern is compatible.

**No jQuery in utilities.** If your solution has jQuery-dependent legacy code, wrap it in `Ops.Legacy.*` and eliminate it incrementally. The utility layer stays dependency-free.

**Named function references on addOnChange.** `Ops.Form.addOnChange` enforces remove-then-add. Pass a named function — anonymous wrappers cannot be removed and stack silently on re-load.

**Constants over strings.** `Ops.Constants.Fields.*`, `Ops.Constants.OptionSets.*`, and `Ops.Constants.NotificationIds.*` replace all inline logical names and option set integers.

---

## Repository layout

```
src/
  debug.js              Logger — load first
  util.js               Pure helpers — date, GUID, string, debounce, dedupe
  webapi.js             Xrm.WebApi async wrapper + fluent query builder
  form.js               formContext attribute/control helpers
  ui.js                 Notifications, dialogs, navigation, progress
  constants.js          Tables, fields, option sets — customize per solution
  forms/
    account.form.js     Example form event handler
  html/
    ops.debug.panel.html  Debug panel web resource (dev-only)
jsconfig.json           VS Code JS project config — enables @types/xrm IntelliSense
package.json            Dev dependencies (npm install to activate IntelliSense)
BEST_PRACTICES.md       Full coding standards and anti-pattern list
```

---

## Related

- [d365-plugin-base](https://github.com/tmykhaylovsky/d365-plugin-base) — server-side Dataverse plugin starter (same Ops namespace, same discipline)
- [Xrm.WebApi reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/xrm-webapi)
- [Client API reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference)
- [Deprecated client APIs](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/deprecated-apis)
