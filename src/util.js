// util.js — Ops.Util
// Pure utility functions — no Xrm dependency, no DOM dependency.
// Mirrors CrmFormat and PluginExtensions helpers from the plugin base,
// adapted for the client-side runtime.
//
// Dependencies: none
// Load order: after debug.js

/* global crypto */

var Ops = Ops || {};

Ops.Util = (function () {
    'use strict';

    // In-flight request cache for Ops.Util.dedupe — private to this module
    var _inFlight = {};

    // -------------------------------------------------------------------------
    // Type guards — mirrors Entity.IsNullOrEmpty, EntityReference.IsNullOrEmpty
    // -------------------------------------------------------------------------

    function isNullOrUndefined(value) {
        return value === null || value === undefined;
    }

    /**
     * Returns true if value is null, undefined, or a whitespace-only string.
     * @param {*} value
     * @returns {boolean}
     * @example
     * Ops.Util.isNullOrEmpty('');    // true
     * Ops.Util.isNullOrEmpty('  '); // true  — whitespace only
     * Ops.Util.isNullOrEmpty('Hi'); // false
     */
    function isNullOrEmpty(value) {
        return isNullOrUndefined(value) || String(value).trim() === '';
    }

    // -------------------------------------------------------------------------
    // GUID helpers — mirrors Guid utilities used in plugin registration
    // -------------------------------------------------------------------------

    /**
     * Strips braces and lowercases — canonical form for Web API ID comparisons.
     * @param {string} str - raw GUID from D365 (may have braces, mixed case)
     * @returns {string|null}
     * @example
     * Ops.Util.normalizeGuid('{A1B2C3D4-1111-2222-3333-444444444444}')
     * // → 'a1b2c3d4-1111-2222-3333-444444444444'
     */
    function normalizeGuid(str) {
        if (isNullOrUndefined(str)) return null;
        return String(str).replace(/[{}]/g, '').toLowerCase();
    }

    /**
     * Returns true if the value is a valid GUID string (with or without braces).
     * @param {string} str
     * @returns {boolean}
     */
    function isValidGuid(str) {
        if (isNullOrUndefined(str)) return false;
        return /^[{]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[}]?$/i.test(String(str));
    }

    /**
     * Generates a cryptographically random v4 GUID (RFC 4122).
     * Uses crypto.getRandomValues() — available in all D365-supported browsers (Edge/Chromium).
     * @returns {string} lowercase GUID with hyphens, no braces
     * @example
     * Ops.Util.newGuid() // → 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
     */
    function newGuid() {
        var buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;  // version 4
        buf[8] = (buf[8] & 0x3f) | 0x80;  // variant 10xx
        var hex = Array.from(buf).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    // -------------------------------------------------------------------------
    // Date helpers — mirrors CrmFormat date patterns from the plugin base
    // -------------------------------------------------------------------------

    /**
     * Returns "YYYY-MM-DD" — D365 Web API date-only format.
     * Uses local date parts to avoid UTC-shift on date-only fields.
     * @param {Date|string} date
     * @returns {string|null}
     * @example
     * var d = new Date(2025, 0, 15);          // Jan 15 2025 local
     * Ops.Util.toWebApiDateOnly(d)  // → '2025-01-15'
     */
    function toWebApiDateOnly(date) {
        if (isNullOrUndefined(date)) return null;
        var d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    /**
     * Returns a full ISO 8601 UTC string — use for datetime (not date-only) fields.
     * @param {Date|string} date
     * @returns {string|null}
     */
    function toWebApiDateTimeUtc(date) {
        if (isNullOrUndefined(date)) return null;
        var d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        return d.toISOString();
    }

    /**
     * Parses a Web API date string to a local Date object.
     * "YYYY-MM-DD" (date-only) is treated as local midnight — not UTC — to avoid DST shift.
     * Strings with time or Z suffix are parsed as UTC then converted to local.
     * @param {string} dateString
     * @returns {Date|null}
     * @example
     * Ops.Util.parseWebApiDate('2025-01-15')            // → Jan 15 local midnight (DST-safe)
     * Ops.Util.parseWebApiDate('2025-01-15T00:00:00Z')  // → may differ by timezone
     */
    function parseWebApiDate(dateString) {
        if (isNullOrUndefined(dateString) || dateString === '') return null;
        var dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
        if (dateOnlyPattern.test(dateString)) {
            var parts = dateString.split('-');
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
        var d = new Date(dateString);
        return isNaN(d.getTime()) ? null : d;
    }

    /**
     * Formats a Date for display using the browser locale.
     * @param {Date|string} date
     * @param {Intl.DateTimeFormatOptions} [options]
     * @returns {string}
     * @example
     * Ops.Util.formatDateDisplay(new Date(2025, 0, 15)) // → 'Jan 15, 2025' (en-US)
     */
    function formatDateDisplay(date, options) {
        if (isNullOrUndefined(date)) return '';
        var d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, options || { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // -------------------------------------------------------------------------
    // Object helpers — mirrors entity attribute access patterns
    // -------------------------------------------------------------------------

    /**
     * Returns a new object containing only the specified keys.
     * Mirror of ColumnSet selection — use before building a PATCH body.
     * @param {object} obj
     * @param {string[]} keys
     * @returns {object}
     * @example
     * var patch = Ops.Util.pick(record, ['name', 'statuscode']);
     * // → { name: 'Acme', statuscode: 1 }  — safe to PATCH, no extra fields
     */
    function pick(obj, keys) {
        if (isNullOrUndefined(obj)) return {};
        var result = {};
        keys.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) result[k] = obj[k];
        });
        return result;
    }

    /**
     * Returns the value at a dot-notation path, or undefined if any segment is missing.
     * Never throws — safe on deeply nested optional data.
     * @param {object} obj
     * @param {string} path - dot-separated key path
     * @returns {*}
     * @example
     * var name = Ops.Util.get(result, 'account.primarycontact.fullname');
     * // safe even if account or primarycontact is null/undefined
     */
    function get(obj, path) {
        if (isNullOrUndefined(obj) || isNullOrEmpty(path)) return undefined;
        return path.split('.').reduce(function (acc, key) {
            return isNullOrUndefined(acc) ? undefined : acc[key];
        }, obj);
    }

    // -------------------------------------------------------------------------
    // Function helpers
    // -------------------------------------------------------------------------

    /**
     * Returns a debounced version of callback — fires only after delayMs of inactivity.
     * Use on onChange handlers for free-text search or filter inputs to avoid per-keystroke API calls.
     * @param {Function} callback
     * @param {number} delayMs
     * @returns {Function}
     * @example
     * var handleSearch = Ops.Util.debounce(function() { _runSearch(); }, 300);
     * // rapid calls reset the timer — _runSearch fires once after 300ms of idle
     */
    function debounce(callback, delayMs) {
        var timer = null;
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { callback.apply(ctx, args); }, delayMs);
        };
    }

    /**
     * Wraps an async function so it cannot run concurrently.
     * A second call while the first is pending returns immediately (not queued).
     * Use on confirm or submit handlers to prevent double-submit on rapid clicks.
     * @param {Function} asyncFn
     * @returns {Function}
     * @example
     * var confirmApply = Ops.Util.singleFlight(async function() {
     *     var ok = await Ops.UI.confirm({ title: 'Apply changes?' });
     *     if (ok) await _saveChanges();
     * });
     * // rapid double-click: first call runs, second is a no-op until first resolves
     */
    function singleFlight(asyncFn) {
        var running = false;
        return function () {
            if (running) return Promise.resolve();
            running = true;
            var args = arguments;
            var ctx = this;
            return Promise.resolve().then(function () {
                return asyncFn.apply(ctx, args);
            }).finally(function () {
                running = false;
            });
        };
    }

    /**
     * Deduplicates concurrent async calls for the same key.
     * If a call with the given key is already in-flight, returns the same Promise.
     * The cache entry clears after the Promise settles (success or error).
     *
     * Use when multiple callers may request the same data simultaneously,
     * e.g., N grid rows all resolving the same lookup name.
     *
     * @param {string} key - unique key for this request (e.g. 'contact-' + id)
     * @param {Function} asyncFn - () => Promise factory for the actual async call
     * @returns {Promise}
     * @example
     * // 10 grid rows requesting the same account name share one pending fetch:
     * function getAccountName(accountId) {
     *     return Ops.Util.dedupe('account-' + accountId, function() {
     *         return Ops.WebApi.getRecord('account', accountId, 'name');
     *     });
     * }
     */
    function dedupe(key, asyncFn) {
        if (_inFlight[key]) return _inFlight[key];
        _inFlight[key] = Promise.resolve().then(function () {
            return asyncFn();
        }).finally(function () {
            delete _inFlight[key];
        });
        return _inFlight[key];
    }

    // -------------------------------------------------------------------------
    // String helpers
    // -------------------------------------------------------------------------

    /**
     * Truncates a string to maxLen characters, appending suffix if truncated.
     * @param {string} str
     * @param {number} maxLen
     * @param {string} [suffix='...']
     * @returns {string}
     * @example
     * Ops.Util.truncate('Hello World', 8)      // → 'Hello...'
     * Ops.Util.truncate('Hi', 8)               // → 'Hi'  (no truncation)
     * Ops.Util.truncate('Hello World', 8, '…') // → 'Hello W…'
     */
    function truncate(str, maxLen, suffix) {
        suffix = suffix !== undefined ? suffix : '...';
        if (isNullOrEmpty(str) || str.length <= maxLen) return str || '';
        return str.slice(0, maxLen - suffix.length) + suffix;
    }

    return {
        // Type guards
        isNullOrUndefined:  isNullOrUndefined,
        isNullOrEmpty:      isNullOrEmpty,

        // GUID
        normalizeGuid:      normalizeGuid,
        isValidGuid:        isValidGuid,
        newGuid:            newGuid,

        // Date
        toWebApiDateOnly:      toWebApiDateOnly,
        toWebApiDateTimeUtc:   toWebApiDateTimeUtc,
        parseWebApiDate:       parseWebApiDate,
        formatDateDisplay:     formatDateDisplay,

        // Object
        pick:               pick,
        get:                get,

        // Function
        debounce:           debounce,
        singleFlight:       singleFlight,
        dedupe:             dedupe,

        // String
        truncate:           truncate
    };
}());
