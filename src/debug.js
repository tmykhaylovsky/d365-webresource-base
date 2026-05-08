// debug.js — Ops.Debug
// Client-side trace logger. Mirrors PluginLogger: level-gated, prefixed, in-memory buffer.
//
// Dependencies: none
// Load order: first — all other Ops modules depend on it
//
// Browser DevTools quick reference:
//   Ops.Debug.setLevel(Ops.Debug.Level.Verbose); // show all log lines
//   Ops.Debug.printTable();                        // view log as a table
//   Ops.Debug.copyToClipboard();                   // copy JSON to clipboard

/* global navigator */

var Ops = Ops || {};

Ops.Debug = (function () {
    'use strict';

    // Mirrors PluginLogger.TraceLevel — same ordinal values, same names
    var Level = Object.freeze({ Off: 0, Critical: 1, Warning: 2, Info: 3, Verbose: 4 });

    var _globalLevel = Level.Info;  // matches most production plugin configs
    var _prefix = '';
    var _log = [];
    var _maxEntries = 500;

    var _levelNames = {};
    Object.keys(Level).forEach(function (k) { _levelNames[Level[k]] = k; });

    function _write(level, message, data) {
        if (level === Level.Off || level > _globalLevel) return;

        var entry = {
            ts:    new Date().toISOString(),
            level: _levelNames[level] || 'Unknown',
            msg:   typeof message === 'function' ? message() : message,
            data:  data !== undefined ? data : null
        };

        if (_log.length >= _maxEntries) _log.shift();
        _log.push(entry);

        if (typeof console === 'undefined') return;

        var line = (_prefix ? '[' + _prefix + '] ' : '') + '[' + entry.level + '] ' + entry.msg;
        switch (level) {
            case Level.Critical: console.error(line, entry.data); break;
            case Level.Warning:  console.warn(line, entry.data);  break;
            case Level.Verbose:  console.debug(line, entry.data); break;
            default:             console.log(line, entry.data);   break;
        }
    }

    return {
        /**
         * Log level constants. Mirror of PluginLogger.TraceLevel (Off=0 … Verbose=4).
         * @example Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
         */
        Level: Level,

        /**
         * Sets the global log level. Calls below this level are suppressed.
         * Change once per page load, not per call.
         * @param {number} level - Ops.Debug.Level.* constant
         * @example
         * // In DevTools console at the start of a debugging session:
         * Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
         */
        setLevel:  function (level)  { _globalLevel = level; },
        getLevel:  function ()       { return _globalLevel; },

        /**
         * Sets the prefix shown in every log line. Set once at the top of each form module.
         * @param {string} prefix
         * @example
         * // Before: [Info] onLoad
         * Ops.Debug.setPrefix('Account.form');
         * // After:  [Account.form] [Info] onLoad
         */
        setPrefix: function (prefix) { _prefix = prefix || ''; },

        /**
         * Low-level write. Prefer the named shortcuts (info, warn, critical, verbose).
         * Accepts a factory function for message to avoid string allocation when suppressed.
         * @param {number} level
         * @param {string|Function} msgOrFactory - string or () => string
         * @param {*} [data]
         */
        trace:    function (level, msgOrFactory, data) { _write(level, msgOrFactory, data); },

        /** @param {string|Function} msgOrFactory  @param {*} [data] */
        critical: function (msgOrFactory, data) { _write(Level.Critical, msgOrFactory, data); },

        /** @param {string|Function} msgOrFactory  @param {*} [data] */
        warn:     function (msgOrFactory, data) { _write(Level.Warning,  msgOrFactory, data); },

        /** @param {string|Function} msgOrFactory  @param {*} [data] */
        info:     function (msgOrFactory, data) { _write(Level.Info,     msgOrFactory, data); },

        /**
         * Zero allocation when level is Info — use a factory function for expensive messages.
         * @param {string|Function} msgOrFactory
         * @param {*} [data]
         * @example
         * // No string built unless Verbose is active:
         * Ops.Debug.verbose(function() { return 'records: ' + JSON.stringify(rows); });
         */
        verbose:  function (msgOrFactory, data) { _write(Level.Verbose,  msgOrFactory, data); },

        /**
         * Returns a shallow copy of the in-memory log buffer. Safe to mutate.
         * @returns {Array<{ts:string, level:string, msg:string, data:*}>}
         */
        getLog: function () { return _log.slice(); },

        clearLog: function () { _log = []; },

        /**
         * Returns the full log as formatted JSON. Paste into a ticket or DevTools console.
         * @returns {string}
         */
        exportJson: function () {
            return JSON.stringify(_log, null, 2);
        },

        /**
         * Copies the log JSON to the system clipboard (HTTPS required — D365 is always HTTPS).
         * Falls back to window.prompt if Clipboard API is unavailable.
         * @example
         * // Click the debug panel button on the form, or call directly in DevTools:
         * Ops.Debug.copyToClipboard(); // then Ctrl+V into Notepad or a support ticket
         */
        copyToClipboard: function () {
            var json = JSON.stringify(_log, null, 2);
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(json).then(function () {
                    console.log('[Ops.Debug] Log copied to clipboard (' + _log.length + ' entries)');
                });
            } else if (typeof window !== 'undefined' && window.prompt) {
                window.prompt('Copy log JSON:', json);
            }
        },

        /**
         * Dumps the log to the DevTools console as a table — quick visual inspection.
         * @example Ops.Debug.printTable();
         */
        printTable: function () {
            if (typeof console !== 'undefined' && console.table) {
                console.table(_log);
            }
        }
    };
}());
