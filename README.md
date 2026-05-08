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
| `src/html/debug.panel.html` | — | Debug panel web resource |

---

## Quickstart

### 0. Install dev tooling

```bash
npm install
```

Installs `@types/xrm` (Xrm.* IntelliSense), `@azure/msal-node` (deploy auth), and `dynamics-web-api` (deploy client). `jsconfig.json` is pre-configured — open any `src/*.js` in VS Code and IntelliSense activates for `Xrm.WebApi`, `Xrm.Navigation`, `formContext`, etc.

### 1. Upload web resources to your environment

**Using the deploy script (recommended):**

```bash
# One-time: copy example config and fill in your Azure app registration details
cp scripts/deploy.config.example.json scripts/deploy.config.json
# edit deploy.config.json: tenantId, clientId, environment URL

# First run — opens a browser login prompt (token cached for future runs)
npm run deploy

# Deploy a single file
node scripts/deploy.js src/debug.js

# List existing web resources with your publisher prefix
npm run list

# Clear cached token (force re-login)
npm run logout
```

See **App Registration Setup** below before first use.

**Manual upload:** Upload each `src/*.js` as a separate web resource in the D365 solution editor with your publisher prefix (`ops_debug.js`, `ops_util.js`, etc.).

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
  debug.js              Logger — load first; exposes Ops.Debug.injectButton()
  util.js               Pure helpers — date, GUID, string, debounce, dedupe
  webapi.js             Xrm.WebApi async wrapper + fluent query builder
  form.js               formContext attribute/control helpers
  ui.js                 Notifications, dialogs, navigation, progress
  constants.js          Tables, fields, option sets — customize per solution
  forms/
    account.form.js               Production Account form handler (field state, onChange, onSave)
    account.webapi.form.js         Dev form — all WebApi CRUD + batch + query builder patterns
    account.uipatterns.form.js     Dev form — confirm, progress, timed notifications, tab nav
  html/
    debug.panel.html    Debug panel web resource (dev-only; iframe with log preview + controls)
scripts/
  deploy.js                       Upload web resources to Dataverse via REST API
  deploy.config.example.json      Copy to deploy.config.json and fill in your credentials
jsconfig.json           VS Code JS project config — enables @types/xrm IntelliSense
package.json            Dev dependencies
BEST_PRACTICES.md       Full coding standards and anti-pattern list
```

---

## Deploy Auth

The deploy script opens your browser for interactive login — no app registration or stored secrets required.

It uses the well-known **Dynamics CRM** public client app (`51f81489-12ee-4a9e-aaae-a2591f45987d`), a multi-tenant Microsoft-registered app that supports delegated Dataverse access. The browser opens automatically; after login the tab shows "Signed in successfully" and the deploy resumes.

Token is cached at `~/.d365deploy/token-cache.json` (mode 600, not committed). Refresh tokens persist across runs (typically 90 days). Run `npm run logout` to force re-authentication.

**Optional overrides in `deploy.config.json`:**
- `tenantId` — your Azure AD tenant ID; speeds up login by skipping tenant discovery
- `clientId` — only needed if you create your own app registration (stricter environments that block the well-known client ID)

**If browser auth is blocked by your tenant:**
1. Go to [Azure Portal](https://portal.azure.com) > App registrations > New registration
2. Name it (e.g., `d365-deploy`), single-tenant, add `http://localhost:3001` as a redirect URI (Web type)
3. API permissions: **Dynamics CRM > user_impersonation** (delegated)
4. Authentication: enable **Allow public client flows**
5. Copy the client ID and tenant ID into `deploy.config.json`

---

## Dataverse MCP (future)

The [Microsoft Dataverse MCP server](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-mcp) and the community [`mwhesse/dataverse-mcp`](https://github.com/mwhesse/dataverse-mcp) expose Dataverse operations as Claude tools — enabling Claude to query live records, inspect metadata, and deploy resources mid-conversation. To configure, add the MCP server to `.claude/settings.json`. Not set up yet — the deploy script covers the immediate workflow.

---

## Related

- [d365-plugin-base](https://github.com/tmykhaylovsky/d365-plugin-base) — server-side Dataverse plugin starter (same Ops namespace, same discipline)
- [Xrm.WebApi reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/xrm-webapi)
- [Client API reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference)
- [Deprecated client APIs](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/deprecated-apis)
