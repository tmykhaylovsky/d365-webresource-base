#!/usr/bin/env node
// deploy.js — Upload web resources in src/ to a Dataverse environment.
//
// First run creates the web resource record; subsequent runs update it.
// Publishes each file after upload.
//
// Auth: opens a browser window for interactive login (no app registration required).
// Token is cached at ~/.d365deploy/token-cache.json and reused silently on subsequent runs.
//
// Setup:
//   1. Copy scripts/deploy.config.example.json → scripts/deploy.config.json
//   2. Set "environment" to your Dataverse URL (e.g. https://qlaprod.crm.dynamics.com)
//   3. npm install
//
// Usage:
//   node scripts/deploy.js                  # deploy all web resources
//   node scripts/deploy.js src/debug.js     # deploy one file
//   node scripts/deploy.js --list           # list web resources matching publisherPrefix
//   node scripts/deploy.js --logout         # clear cached token (force re-login next run)

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { exec }            = require('child_process');
const { PublicClientApplication, CryptoProvider } = require('@azure/msal-node');
const { DynamicsWebApi } = require('dynamics-web-api');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(__dirname, 'deploy.config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('[deploy] deploy.config.json not found.');
        console.error('[deploy] Copy scripts/deploy.config.example.json → scripts/deploy.config.json and set the "environment" URL.');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// Token cache — file-based MSAL ICachePlugin
// ---------------------------------------------------------------------------

const CACHE_DIR  = path.join(os.homedir(), '.d365deploy');
const CACHE_FILE = path.join(CACHE_DIR, 'token-cache.json');

const fileCachePlugin = {
    beforeCacheAccess(cacheContext) {
        if (fs.existsSync(CACHE_FILE)) {
            cacheContext.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    },
    afterCacheAccess(cacheContext) {
        if (cacheContext.cacheHasChanged) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            fs.writeFileSync(CACHE_FILE, cacheContext.tokenCache.serialize(), { mode: 0o600 });
        }
    }
};

// ---------------------------------------------------------------------------
// Auth — browser-based auth code + PKCE with token caching
//
// Uses the well-known "Dynamics CRM" public client app (registered by Microsoft,
// no custom app registration required). Set "clientId" in config to override.
// ---------------------------------------------------------------------------

const DEFAULT_CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const REDIRECT_PORT     = 3001;
const REDIRECT_URI      = `http://localhost:${REDIRECT_PORT}`;

let _pca = null;

function buildPca(config) {
    if (_pca) return _pca;
    _pca = new PublicClientApplication({
        auth: {
            clientId:  config.clientId  || DEFAULT_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${config.tenantId || 'common'}`
        },
        cache: { cachePlugin: fileCachePlugin }
    });
    return _pca;
}

async function getAccessToken(config) {
    const pca    = buildPca(config);
    const scopes = [`${config.environment}/.default`];

    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
        try {
            const r = await pca.acquireTokenSilent({ account: accounts[0], scopes });
            return r.accessToken;
        } catch { /* refresh token expired — fall through to browser login */ }
    }

    return _acquireByBrowser(pca, scopes);
}

async function _acquireByBrowser(pca, scopes) {
    const crypto = new CryptoProvider();
    const { verifier, challenge } = await crypto.generatePkceCodes();

    return new Promise(function (resolve, reject) {
        const server = http.createServer(async function (req, res) {
            const qs    = new URL(req.url, REDIRECT_URI).searchParams;
            const code  = qs.get('code');
            const error = qs.get('error');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body style="font-family:Segoe UI,sans-serif;padding:48px;max-width:500px">' +
                    '<h2 style="color:#0078d4">Signed in successfully</h2>' +
                    '<p>You can close this browser tab and return to the terminal.</p>' +
                    '</body></html>');
            server.close();

            if (error) {
                reject(new Error(qs.get('error_description') || error));
                return;
            }
            if (!code) {
                reject(new Error('No auth code in redirect response'));
                return;
            }

            try {
                const r = await pca.acquireTokenByCode({
                    code,
                    scopes,
                    redirectUri:  REDIRECT_URI,
                    codeVerifier: verifier
                });
                resolve(r.accessToken);
            } catch (err) {
                reject(err);
            }
        });

        server.on('error', reject);

        server.listen(REDIRECT_PORT, async function () {
            try {
                const authUrl = await pca.getAuthCodeUrl({
                    scopes,
                    redirectUri:         REDIRECT_URI,
                    codeChallenge:       challenge,
                    codeChallengeMethod: 'S256'
                });

                console.log('[deploy] Opening browser for login...');
                _openBrowser(authUrl);
                console.log('[deploy] Waiting for sign-in. If browser did not open, visit:\n  ' + authUrl + '\n');
            } catch (err) {
                server.close();
                reject(err);
            }
        });
    });
}

function _openBrowser(url) {
    const cmd = process.platform === 'darwin' ? `open "${url}"` :
                process.platform === 'win32'  ? `start "" "${url}"` :
                                                `xdg-open "${url}"`;
    exec(cmd);
}

// ---------------------------------------------------------------------------
// Web resource type map
// ---------------------------------------------------------------------------

const WEB_RESOURCE_TYPES = {
    '.js':   3,
    '.html': 1,
    '.htm':  1,
    '.css':  2,
    '.xml':  4,
    '.png':  5,
    '.jpg':  6,
    '.gif':  7,
    '.xap':  8,
    '.xsl':  9,
    '.ico': 10,
    '.svg': 11,
    '.resx':12
};

function getWebResourceType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return WEB_RESOURCE_TYPES[ext] || 3;
}

// ---------------------------------------------------------------------------
// File discovery and name mapping
// ---------------------------------------------------------------------------

const SRC_DIR = path.join(__dirname, '..', 'src');

function discoverFiles() {
    const results = [];
    function walk(dir) {
        fs.readdirSync(dir).forEach(function (name) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) {
                walk(full);
            } else if (/\.(js|html?|css|svg|png|ico)$/.test(name)) {
                results.push(full);
            }
        });
    }
    walk(SRC_DIR);
    return results;
}

function getWebResourceName(filePath, config) {
    const rel = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    if (config.fileMap && config.fileMap[rel]) {
        return config.fileMap[rel];
    }
    // Default: {prefix}_{filename} — subdirectory is not encoded in the name
    const prefix = config.publisherPrefix || 'ops';
    return prefix + '_' + path.basename(filePath);
}

// ---------------------------------------------------------------------------
// Dataverse operations
// ---------------------------------------------------------------------------

async function buildApiClient(config) {
    // Prime the token now so the browser prompt appears before API calls start
    const token = await getAccessToken(config);

    const api = new DynamicsWebApi({
        serverUrl:      config.environment + '/',
        onTokenRefresh: async function () {
            return getAccessToken(config);
        }
    });

    // Verify connectivity — surfaces auth errors early with a clear message
    try {
        await api.callFunction('WhoAmI');
        console.log('[deploy] Authenticated.\n');
    } catch (err) {
        console.error('[deploy] Auth check failed: ' + (err.message || err));
        console.error('[deploy] Run --logout to clear the cached token and try again.');
        process.exit(1);
    }

    return { api, token };
}

async function findWebResource(api, name) {
    const result = await api.retrieveMultipleRecords('webresource', {
        filters: [{ conditions: [{ attribute: 'name', operator: 'eq', value: name }] }],
        select:  ['webresourceid', 'name', 'displayname', 'modifiedon']
    });
    return result.value.length > 0 ? result.value[0] : null;
}

async function uploadWebResource(api, filePath, config) {
    const name    = getWebResourceName(filePath, config);
    const b64     = fs.readFileSync(filePath).toString('base64');
    const type    = getWebResourceType(filePath);
    const display = path.basename(filePath);

    const existing = await findWebResource(api, name);
    let webResourceId;

    if (existing) {
        webResourceId = existing.webresourceid;
        await api.updateRecord({
            collection: 'webresourceset',
            key:        webResourceId,
            data:       { content: b64 }
        });
        process.stdout.write('[deploy] updated  ' + name + '  ');
    } else {
        webResourceId = await api.createRecord({
            collection: 'webresourceset',
            data: {
                name:            name,
                displayname:     display,
                webresourcetype: type,
                content:         b64
            }
        });
        process.stdout.write('[deploy] created  ' + name + '  ');
    }

    await _publishWebResource(api, webResourceId);
    console.log('(published)');

    return { name, webResourceId };
}

async function _publishWebResource(api, webResourceId) {
    const xml = `<importexportxml><webresources><webresource>{${webResourceId}}</webresource></webresources></importexportxml>`;
    await api.callAction('PublishXml', { ParameterXml: xml });
}

async function listWebResources(api, prefix) {
    const result = await api.retrieveMultipleRecords('webresource', {
        filters: [{ conditions: [{ attribute: 'name', operator: 'begins-with', value: prefix + '_' }] }],
        select:  ['name', 'displayname', 'webresourcetype', 'modifiedon'],
        orderBy: [{ attribute: 'name' }]
    });

    if (result.value.length === 0) {
        console.log('[deploy] No web resources found with prefix "' + prefix + '_".');
        return;
    }

    console.log('\n  ' + 'Name'.padEnd(44) + 'Type'.padEnd(6) + 'Modified');
    console.log('  ' + '-'.repeat(68));
    result.value.forEach(function (r) {
        const ext = Object.keys(WEB_RESOURCE_TYPES).find(k => WEB_RESOURCE_TYPES[k] === r.webresourcetype) || '?';
        const mod = r.modifiedon ? r.modifiedon.slice(0, 10) : '—';
        console.log('  ' + r.name.padEnd(44) + ext.padEnd(6) + mod);
    });
    console.log('');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
    const args   = process.argv.slice(2);
    const config = loadConfig();

    if (args.includes('--logout')) {
        if (fs.existsSync(CACHE_FILE)) {
            fs.unlinkSync(CACHE_FILE);
            console.log('[deploy] Token cache cleared. Browser login will be required next run.');
        } else {
            console.log('[deploy] No cached token found.');
        }
        return;
    }

    const { api } = await buildApiClient(config);

    if (args.includes('--list')) {
        await listWebResources(api, config.publisherPrefix || 'ops');
        return;
    }

    const filePaths = args
        .filter(a => !a.startsWith('--'))
        .map(a => path.resolve(a))
        .filter(a => fs.existsSync(a));

    const targets = filePaths.length > 0 ? filePaths : discoverFiles();

    if (targets.length === 0) {
        console.log('[deploy] No files to deploy.');
        return;
    }

    console.log('[deploy] Deploying ' + targets.length + ' file(s) to ' + config.environment + '\n');

    let ok = 0, failed = 0;
    for (const filePath of targets) {
        try {
            await uploadWebResource(api, filePath, config);
            ok++;
        } catch (err) {
            const name = getWebResourceName(filePath, config);
            console.error('[deploy] FAILED  ' + name + ': ' + (err.message || err));
            failed++;
        }
    }

    console.log('\n[deploy] Done — ' + ok + ' succeeded, ' + failed + ' failed.');
}

main().catch(function (err) {
    console.error('[deploy] Fatal: ' + (err.message || err));
    process.exit(1);
});
