// webapi.js — Ops.WebApi
// Async wrapper over Xrm.WebApi. Mirrors OrganizationServiceExtensions from the plugin base:
// centralized error handling, logging, optional retry, clean return types.
//
// Approach: async/await exclusively. All methods return Promises.
// Never mix callbacks and Promises in the same call chain.
//
// Dependencies: Ops.Debug, Ops.Util
// Load order: after debug.js, util.js

/* global Xrm, fetch */

var Ops = Ops || {};

Ops.WebApi = (function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    var _retryableStatuses = [429, 500, 502, 503, 504];

    function _formatError(err) {
        if (!err) return 'Unknown error';
        if (typeof err === 'string') return err;
        var msg = err.message || err.errorMessage || err.statusText || 'Unknown error';
        if (err.innererror && err.innererror.message) {
            msg += ' | Inner: ' + err.innererror.message;
        }
        return msg;
    }

    function _isRetryable(err) {
        if (!err) return false;
        var status = err.status || err.errorCode;
        return _retryableStatuses.indexOf(status) !== -1;
    }

    // Exponential backoff — base 500ms, capped at 8s
    function _backoffMs(attempt) {
        return Math.min(500 * Math.pow(2, attempt), 8000);
    }

    function _sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function _getClientUrl() {
        return Xrm.Utility.getGlobalContext().getClientUrl();
    }

    // Core executor — runs apiCall(), retries on transient failure up to maxRetries times.
    // maxRetries defaults to 0 (no retry). Pass 3 for operations prone to 429 throttling.
    async function _execute(label, apiCall, maxRetries) {
        maxRetries = maxRetries !== undefined ? maxRetries : 0;
        var attempt = 0;
        while (true) {
            try {
                Ops.Debug.verbose(function () { return label; });
                var result = await apiCall();
                Ops.Debug.verbose(function () { return label + ' — OK'; });
                return result;
            } catch (err) {
                var msg = _formatError(err);
                if (_isRetryable(err) && attempt < maxRetries) {
                    attempt++;
                    var delay = _backoffMs(attempt);
                    Ops.Debug.warn(label + ' — retryable error (attempt ' + attempt + '/' + maxRetries + '): ' + msg);
                    await _sleep(delay);
                    continue;
                }
                Ops.Debug.critical(label + ' — failed: ' + msg, err);
                throw err;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Core CRUD — mirrors OrganizationServiceExtensions methods
    // -------------------------------------------------------------------------

    /**
     * Retrieves a single record by ID. Mirror of Retrieve<T>(tableName, id, columnSet).
     * @param {string} entityLogicalName - e.g. 'account'
     * @param {string} id - record GUID
     * @param {string} [select] - comma-separated field names. Always specify — avoid selecting all.
     * @returns {Promise<object>}
     * @example
     * var account = await Ops.WebApi.getRecord('account', accountId, 'name,statuscode,accountnumber');
     */
    async function getRecord(entityLogicalName, id, select) {
        var options = select ? '?$select=' + select.replace(/^\?\$select=/, '') : '';
        return _execute(
            'getRecord(' + entityLogicalName + ',' + id + ')',
            function () { return Xrm.WebApi.retrieveRecord(entityLogicalName, id, options); }
        );
    }

    /**
     * Retrieves multiple records. Follows nextLink paging — returns the full flattened array.
     * Mirror of GetAll<T>. Always $select the columns you need.
     * @param {string} entityLogicalName
     * @param {string} [options] - OData query string (e.g. '?$filter=statecode eq 0&$select=name')
     * @param {number} [maxPageSize=5000]
     * @returns {Promise<object[]>}
     * @example
     * var contacts = await Ops.WebApi.getRecords('contact',
     *     '?$filter=parentcustomerid/accountid eq ' + accountId + '&$select=fullname,statuscode');
     */
    async function getRecords(entityLogicalName, options, maxPageSize) {
        var label = 'getRecords(' + entityLogicalName + ')';
        var allRecords = [];
        var nextLink = null;
        var pageOptions = options || '';

        do {
            var result = await _execute(label, function () {
                var q = nextLink ? null : pageOptions;
                return Xrm.WebApi.retrieveMultipleRecords(entityLogicalName, q, maxPageSize || 5000);
            });

            if (result && result.entities) {
                allRecords = allRecords.concat(result.entities);
            }
            nextLink = result && result.nextLink ? result.nextLink : null;

            if (nextLink) {
                pageOptions = nextLink;
                nextLink = null;
            }
        } while (result && result.nextLink);

        Ops.Debug.verbose(function () {
            return label + ' — returned ' + allRecords.length + ' record(s)';
        });
        return allRecords;
    }

    /**
     * Creates a record. Mirror of Create(entity). Returns the new record's GUID.
     * @param {string} entityLogicalName
     * @param {object} data - field values to set
     * @returns {Promise<string>} normalized GUID of the created record
     * @example
     * var newId = await Ops.WebApi.createRecord('task', {
     *     subject: 'Follow up',
     *     regardingobjectid_account: accountId
     * });
     */
    async function createRecord(entityLogicalName, data) {
        var result = await _execute(
            'createRecord(' + entityLogicalName + ')',
            function () { return Xrm.WebApi.createRecord(entityLogicalName, data); }
        );
        return result && result.id ? Ops.Util.normalizeGuid(result.id) : null;
    }

    /**
     * Updates a record. Mirror of Update(entity). Returns void.
     * @param {string} entityLogicalName
     * @param {string} id
     * @param {object} data - only the fields to update (partial update / PATCH)
     * @returns {Promise<void>}
     * @example
     * await Ops.WebApi.updateRecord('account', accountId, { statuscode: 2 });
     */
    async function updateRecord(entityLogicalName, id, data) {
        await _execute(
            'updateRecord(' + entityLogicalName + ',' + id + ')',
            function () { return Xrm.WebApi.updateRecord(entityLogicalName, id, data); }
        );
    }

    /**
     * Deletes a record. Mirror of Delete(tableName, id). Returns void.
     * @param {string} entityLogicalName
     * @param {string} id
     * @returns {Promise<void>}
     */
    async function deleteRecord(entityLogicalName, id) {
        await _execute(
            'deleteRecord(' + entityLogicalName + ',' + id + ')',
            function () { return Xrm.WebApi.deleteRecord(entityLogicalName, id); }
        );
    }

    /**
     * Executes a Custom API action or function. Pass a Xrm.WebApi request object.
     * Mirror of Execute(OrganizationRequest).
     * @param {object} request - Xrm.WebApi request with getMetadata()
     * @returns {Promise<object>}
     */
    async function execute(request) {
        return _execute(
            'execute(' + (request && request.getMetadata ? request.getMetadata().operationName : 'unknown') + ')',
            function () { return Xrm.WebApi.online.execute(request); }
        );
    }

    // -------------------------------------------------------------------------
    // Convenience query helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the first record matching the filter, or null. Mirror of GetFirstOrDefault<T>.
     * @param {string} entityLogicalName
     * @param {string} filter - OData $filter expression
     * @param {string} [select] - comma-separated field names
     * @returns {Promise<object|null>}
     * @example
     * var account = await Ops.WebApi.getFirstOrDefault('account', "name eq 'Acme'", 'name,statuscode');
     */
    async function getFirstOrDefault(entityLogicalName, filter, select) {
        var options = '?$top=1';
        if (filter) options += '&$filter=' + filter;
        if (select) options += '&$select=' + select;
        var records = await getRecords(entityLogicalName, options, 1);
        return records.length > 0 ? records[0] : null;
    }

    /**
     * Returns true if any record matches the filter. Mirror of RecordExists.
     * @param {string} entityLogicalName
     * @param {string} filter - OData $filter expression
     * @returns {Promise<boolean>}
     */
    async function exists(entityLogicalName, filter) {
        var record = await getFirstOrDefault(entityLogicalName, filter, entityLogicalName + 'id');
        return record !== null;
    }

    // -------------------------------------------------------------------------
    // Fluent OData query builder
    // Constructs a $select/$filter/$orderby/$top/$expand query string and calls getRecords().
    // Use for readable query construction. Use getRecords() directly for complex raw OData.
    // Both implementations exist side by side — no transport difference.
    // -------------------------------------------------------------------------

    /**
     * Returns a chainable query builder for the given entity.
     * Call .getAll() or .getFirst() to execute.
     * @param {string} entityLogicalName - singular logical name (e.g. 'account')
     * @returns {{ select, where, orderBy, top, expand, getAll, getFirst }}
     * @example
     * // Fluent (readable):
     * var accounts = await Ops.WebApi.query('account')
     *     .select('name', 'statuscode', 'accountnumber')
     *     .where('statecode eq 0')
     *     .orderBy('name')
     *     .top(10)
     *     .getAll();
     *
     * // Raw string equivalent — use for OData the builder doesn't cover (e.g. nested expands):
     * var accounts = await Ops.WebApi.getRecords('account',
     *     '?$select=name,statuscode,accountnumber&$filter=statecode eq 0&$orderby=name&$top=10');
     */
    function query(entityLogicalName) {
        var _selects  = [];
        var _filters  = [];
        var _orderBys = [];
        var _expands  = [];
        var _topN     = null;

        function _build() {
            var parts = [];
            if (_selects.length)  parts.push('$select='  + _selects.join(','));
            if (_filters.length)  parts.push('$filter='  + _filters.join(' and '));
            if (_orderBys.length) parts.push('$orderby=' + _orderBys.join(','));
            if (_topN !== null)   parts.push('$top='     + _topN);
            if (_expands.length)  parts.push('$expand='  + _expands.join(','));
            return parts.length ? '?' + parts.join('&') : '';
        }

        var builder = {
            /** @param {...string} fields - field logical names to include */
            select:  function ()           { _selects  = Array.prototype.slice.call(arguments); return builder; },
            /** @param {string} filter - OData filter expression (e.g. 'statecode eq 0') */
            where:   function (filter)     { _filters.push(filter);                              return builder; },
            /** @param {string} field  @param {boolean} [desc=false] */
            orderBy: function (field, desc){ _orderBys.push(field + (desc ? ' desc' : ' asc')); return builder; },
            /** @param {number} n */
            top:     function (n)          { _topN = n;                                          return builder; },
            /**
             * @param {string} navProp - navigation property name (same as field name for single-valued lookups;
             *   use typed nav prop for polymorphic lookups, e.g. 'customerid_account' not 'customerid').
             * @param {string[]} [selectFields] - fields to $select inside the expand
             */
            expand:  function (navProp, selectFields) {
                var expr = navProp;
                if (selectFields && selectFields.length) {
                    expr += '($select=' + selectFields.join(',') + ')';
                }
                _expands.push(expr);
                return builder;
            },

            /**
             * Executes the query and returns all matching records (follows nextLink paging).
             * @param {number} [maxPageSize]
             * @returns {Promise<object[]>}
             */
            getAll:  function (maxPageSize) { return getRecords(entityLogicalName, _build(), maxPageSize); },

            /**
             * Sets $top=1 and returns the first record, or null.
             * @returns {Promise<object|null>}
             */
            getFirst: function () {
                _topN = 1;
                return getRecords(entityLogicalName, _build(), 1).then(function (rows) {
                    return rows.length > 0 ? rows[0] : null;
                });
            }
        };

        return builder;
    }

    // -------------------------------------------------------------------------
    // $batch helper — raw fetch for multi-operation atomic writes
    // Xrm.WebApi has no batch support; use this for changesets.
    // -------------------------------------------------------------------------

    /**
     * Executes a raw OData $batch request as a single changeset (atomic).
     * @param {Array<{method: string, url: string, body?: object}>} parts
     * @returns {Promise<Response>} raw fetch Response — inspect .ok and .status
     * @example
     * // url must be the OData entity set name (plural), NOT the logical name.
     * // Xrm.WebApi pluralizes internally; $batch does not.
     * await Ops.WebApi.batch([
     *     { method: 'PATCH', url: 'accounts(' + id1 + ')', body: { statuscode: 2 } },
     *     { method: 'PATCH', url: 'accounts(' + id2 + ')', body: { statuscode: 2 } }
     * ]);
     */
    async function batch(parts) {
        var clientUrl = Xrm.Utility.getGlobalContext().getClientUrl();
        var batchId = 'batch_' + Ops.Util.newGuid();
        var changesetId = 'changeset_' + Ops.Util.newGuid();
        var boundary = batchId;

        var body = '--' + boundary + '\r\n';
        body += 'Content-Type: multipart/mixed; boundary=' + changesetId + '\r\n\r\n';
        parts.forEach(function (part, i) {
            body += '--' + changesetId + '\r\n';
            body += 'Content-Type: application/http\r\n';
            body += 'Content-Transfer-Encoding: binary\r\n';
            body += 'Content-ID: ' + (i + 1) + '\r\n\r\n';
            body += part.method + ' ' + clientUrl + '/api/data/v9.2/' + part.url + ' HTTP/1.1\r\n';
            body += 'Content-Type: application/json;type=entry\r\n\r\n';
            if (part.body) body += JSON.stringify(part.body) + '\r\n';
        });
        body += '--' + changesetId + '--\r\n';
        body += '--' + boundary + '--';

        Ops.Debug.verbose('batch — sending ' + parts.length + ' operation(s)');

        var response = await fetch(clientUrl + '/api/data/v9.2/$batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'multipart/mixed; boundary=' + boundary,
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json',
                'Prefer': 'odata.include-annotations=OData.Community.Display.V1.FormattedValue'
            },
            body: body
        });

        if (!response.ok) {
            var errText = await response.text();
            Ops.Debug.critical('batch — HTTP ' + response.status, errText);
            throw new Error('$batch failed: HTTP ' + response.status + ' — ' + errText);
        }

        Ops.Debug.verbose('batch — OK (HTTP ' + response.status + ')');
        return response;
    }

    // -------------------------------------------------------------------------
    // Associate / Disassociate — N:N relationships
    // Xrm.WebApi has no native method; uses raw fetch against $ref endpoint.
    // -------------------------------------------------------------------------

    /**
     * Associates two records via an N:N relationship. Uses raw fetch — Xrm.WebApi has no native method.
     * @param {string} fromEntitySetName - plural entity set name (e.g. 'opportunities')
     * @param {string} fromId - GUID of the source record
     * @param {string} navigationProperty - collection-valued nav property (e.g. 'opportunitycompetitors')
     *   Find nav property names in Ops.Constants.Relationships, NOT the lookup field name.
     * @param {string} toEntitySetName - plural entity set name of the target (e.g. 'competitors')
     * @param {string} toId - GUID of the target record
     * @returns {Promise<void>}
     * @example
     * await Ops.WebApi.associate(
     *     'opportunities', opportunityId,
     *     Ops.Constants.Relationships.Opportunity.Competitors,
     *     'competitors', competitorId
     * );
     */
    async function associate(fromEntitySetName, fromId, navigationProperty, toEntitySetName, toId) {
        var baseUrl = _getClientUrl() + '/api/data/v9.2/';
        var url = baseUrl + fromEntitySetName + '(' + Ops.Util.normalizeGuid(fromId) + ')/' + navigationProperty + '/$ref';
        var body = { '@odata.id': baseUrl + toEntitySetName + '(' + Ops.Util.normalizeGuid(toId) + ')' };

        Ops.Debug.verbose('associate — ' + fromEntitySetName + ' → ' + toEntitySetName + ' via ' + navigationProperty);

        var response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            var err = await response.text();
            Ops.Debug.critical('associate failed: HTTP ' + response.status, err);
            throw new Error('associate failed: HTTP ' + response.status + ' — ' + err);
        }

        Ops.Debug.verbose('associate — OK');
    }

    /**
     * Disassociates two records via an N:N relationship. Uses raw fetch.
     * @param {string} fromEntitySetName - plural entity set name (e.g. 'opportunities')
     * @param {string} fromId - GUID of the source record
     * @param {string} navigationProperty - collection-valued nav property (e.g. 'opportunitycompetitors')
     * @param {string} toId - GUID of the target record to remove
     * @returns {Promise<void>}
     */
    async function disassociate(fromEntitySetName, fromId, navigationProperty, toId) {
        var baseUrl = _getClientUrl() + '/api/data/v9.2/';
        var url = baseUrl + fromEntitySetName + '(' + Ops.Util.normalizeGuid(fromId) + ')/' +
                  navigationProperty + '(' + Ops.Util.normalizeGuid(toId) + ')/$ref';

        Ops.Debug.verbose('disassociate — ' + fromEntitySetName + ' (' + fromId + ') → ' + toId);

        var response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            var errText = await response.text();
            Ops.Debug.critical('disassociate failed: HTTP ' + response.status, errText);
            throw new Error('disassociate failed: HTTP ' + response.status + ' — ' + errText);
        }

        Ops.Debug.verbose('disassociate — OK');
    }

    // -------------------------------------------------------------------------
    // Action / Function execution — generic raw-fetch wrappers
    // Prefer these over Xrm.WebApi.online.execute() for general use — that API
    // requires per-action getMetadata() with parameterTypes that cannot be
    // generalized in a wrapper.
    // -------------------------------------------------------------------------

    /**
     * Executes an unbound or bound Dataverse action via raw fetch.
     * @param {string} actionName - e.g. 'WinOpportunity'
     * @param {object} [parameters] - action request body (JSON-serializable)
     * @param {string} [boundEntitySetName] - plural entity set if bound, omit if unbound
     * @param {string} [boundId] - record GUID if bound
     * @returns {Promise<object|null>} parsed response body, or null for 204 No Content
     * @example
     * // Unbound:
     * await Ops.WebApi.executeAction('WinOpportunity', { OpportunityClose: {...}, Status: 3 });
     *
     * // Bound:
     * await Ops.WebApi.executeAction('Qualify', { CreateAccount: true }, 'leads', leadId);
     */
    async function executeAction(actionName, parameters, boundEntitySetName, boundId) {
        var baseUrl = _getClientUrl() + '/api/data/v9.2/';
        var url = (boundEntitySetName && boundId)
            ? baseUrl + boundEntitySetName + '(' + Ops.Util.normalizeGuid(boundId) + ')/Microsoft.Dynamics.CRM.' + actionName
            : baseUrl + actionName;

        Ops.Debug.verbose('executeAction — ' + actionName);

        var response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json'
            },
            body: JSON.stringify(parameters || {})
        });

        if (!response.ok) {
            var errText = await response.text();
            Ops.Debug.critical('executeAction(' + actionName + ') failed: HTTP ' + response.status, errText);
            throw new Error(actionName + ' failed: HTTP ' + response.status + ' — ' + errText);
        }

        Ops.Debug.verbose('executeAction — ' + actionName + ' OK (HTTP ' + response.status + ')');
        var text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    /**
     * Executes an unbound or bound Dataverse function (GET, read-only).
     * @param {string} functionName - e.g. 'RetrievePrincipalAccess'
     * @param {object} [parameters] - key-value pairs appended as inline function parameters
     * @param {string} [boundEntitySetName]
     * @param {string} [boundId]
     * @returns {Promise<object|null>}
     */
    async function executeFunction(functionName, parameters, boundEntitySetName, boundId) {
        var baseUrl = _getClientUrl() + '/api/data/v9.2/';
        var paramString = '';
        if (parameters && Object.keys(parameters).length) {
            var pairs = Object.keys(parameters).map(function (k) {
                return k + '=' + encodeURIComponent(JSON.stringify(parameters[k]));
            });
            paramString = '(' + pairs.join(',') + ')';
        }

        var url = (boundEntitySetName && boundId)
            ? baseUrl + boundEntitySetName + '(' + Ops.Util.normalizeGuid(boundId) + ')/Microsoft.Dynamics.CRM.' + functionName + paramString
            : baseUrl + functionName + paramString;

        Ops.Debug.verbose('executeFunction — ' + functionName);

        var response = await fetch(url, {
            method: 'GET',
            headers: {
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            var errText = await response.text();
            Ops.Debug.critical('executeFunction(' + functionName + ') failed: HTTP ' + response.status, errText);
            throw new Error(functionName + ' failed: HTTP ' + response.status + ' — ' + errText);
        }

        var text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    // -------------------------------------------------------------------------
    // Opportunity lifecycle convenience wrappers
    // -------------------------------------------------------------------------

    /**
     * Closes an Opportunity as Won. Creates an opportunityclose audit activity.
     * Do NOT use updateRecord with statecode/statuscode — it bypasses the audit trail.
     * @param {string} opportunityId
     * @param {string} [subject] - subject for the OpportunityClose activity (default: 'Won')
     * @param {string} [description]
     * @returns {Promise<void>}
     */
    async function winOpportunity(opportunityId, subject, description) {
        return executeAction('WinOpportunity', {
            OpportunityClose: {
                '@odata.type': 'Microsoft.Dynamics.CRM.opportunityclose',
                'opportunityid@odata.bind': '/opportunities(' + Ops.Util.normalizeGuid(opportunityId) + ')',
                subject: subject || 'Won',
                description: description || ''
            },
            Status: 3
        });
    }

    /**
     * Closes an Opportunity as Lost. Creates an opportunityclose audit activity.
     * @param {string} opportunityId
     * @param {number} [statusCode] - 4=Canceled (default), 5=OutSold
     * @param {string} [subject]
     * @param {string} [description]
     * @returns {Promise<void>}
     */
    async function loseOpportunity(opportunityId, statusCode, subject, description) {
        return executeAction('LoseOpportunity', {
            OpportunityClose: {
                '@odata.type': 'Microsoft.Dynamics.CRM.opportunityclose',
                'opportunityid@odata.bind': '/opportunities(' + Ops.Util.normalizeGuid(opportunityId) + ')',
                subject: subject || 'Lost',
                description: description || ''
            },
            Status: statusCode || 4
        });
    }

    /**
     * Reopens a Won or Lost Opportunity. Sets statecode=0 (Open), statuscode=1 (InProgress).
     * No dedicated Dataverse action exists for reopen — direct PATCH is correct here.
     * @param {string} opportunityId
     * @returns {Promise<void>}
     */
    async function reopenOpportunity(opportunityId) {
        return updateRecord('opportunity', opportunityId, {
            statecode: 0,
            statuscode: 1
        });
    }

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        getRecord:          getRecord,
        getRecords:         getRecords,
        createRecord:       createRecord,
        updateRecord:       updateRecord,
        deleteRecord:       deleteRecord,
        execute:            execute,
        getFirstOrDefault:  getFirstOrDefault,
        exists:             exists,
        query:              query,
        batch:              batch,
        associate:          associate,
        disassociate:       disassociate,
        executeAction:      executeAction,
        executeFunction:    executeFunction,
        winOpportunity:     winOpportunity,
        loseOpportunity:    loseOpportunity,
        reopenOpportunity:  reopenOpportunity,

        _testing: {
            isRetryable: _isRetryable,
            backoffMs:   _backoffMs,
            formatError: _formatError
        }
    };
}());
