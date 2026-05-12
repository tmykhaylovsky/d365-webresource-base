'use strict';

const { XrmMockGenerator } = require('xrm-mock');

const CLIENT_URL = 'https://org.crm.dynamics.com';

beforeEach(function() {
    XrmMockGenerator.initialise();
    Ops.Debug.setLevel(Ops.Debug.Level.Off);

    // Stub Xrm.WebApi methods
    Xrm.WebApi.retrieveRecord = jest.fn();
    Xrm.WebApi.retrieveMultipleRecords = jest.fn();
    Xrm.WebApi.createRecord = jest.fn();
    Xrm.WebApi.updateRecord = jest.fn();
    Xrm.WebApi.deleteRecord = jest.fn();

    // Stub global.fetch for associate/disassociate/executeAction/executeFunction/batch
    global.fetch = jest.fn();

    // Stub getClientUrl
    Xrm.Utility.getGlobalContext = jest.fn().mockReturnValue({
        getClientUrl: jest.fn().mockReturnValue(CLIENT_URL)
    });
});

afterEach(function() {
    delete global.fetch;
    jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// _formatError, _isRetryable, _backoffMs (via _testing export)
// ---------------------------------------------------------------------------

describe('Ops.WebApi._formatError', function() {
    test('error with message → returns message string', function() {
        var result = Ops.WebApi._testing.formatError({ message: 'Something went wrong' });
        expect(result).toBe('Something went wrong');
    });

    test('error with innererror → appends inner message', function() {
        var result = Ops.WebApi._testing.formatError({
            message: 'Outer', innererror: { message: 'Inner detail' }
        });
        expect(result).toContain('Outer');
        expect(result).toContain('Inner detail');
    });

    test('null → "Unknown error"', function() {
        expect(Ops.WebApi._testing.formatError(null)).toBe('Unknown error');
    });
});

describe('Ops.WebApi._isRetryable', function() {
    test('status 429 → true', function() {
        expect(Ops.WebApi._testing.isRetryable({ status: 429 })).toBe(true);
    });

    test('status 400 → false', function() {
        expect(Ops.WebApi._testing.isRetryable({ status: 400 })).toBe(false);
    });

    test('null → false', function() {
        expect(Ops.WebApi._testing.isRetryable(null)).toBe(false);
    });
});

describe('Ops.WebApi._backoffMs', function() {
    test('attempt 0 → 500ms', function() {
        expect(Ops.WebApi._testing.backoffMs(0)).toBe(500);
    });

    test('attempt 3 → 4000ms', function() {
        expect(Ops.WebApi._testing.backoffMs(3)).toBe(4000);
    });

    test('attempt 10 → capped at 8000ms (not 256000)', function() {
        expect(Ops.WebApi._testing.backoffMs(10)).toBe(8000);
    });
});

// ---------------------------------------------------------------------------
// getRecord
// ---------------------------------------------------------------------------

describe('Ops.WebApi.getRecord', function() {
    test('calls Xrm.WebApi.retrieveRecord with correct args', function() {
        Xrm.WebApi.retrieveRecord = jest.fn().mockResolvedValue({ name: 'Acme' });
        return Ops.WebApi.getRecord('account', 'acc-id').then(function() {
            expect(Xrm.WebApi.retrieveRecord).toHaveBeenCalledWith('account', 'acc-id', '');
        });
    });

    test('appends ?$select= when select string provided', function() {
        Xrm.WebApi.retrieveRecord = jest.fn().mockResolvedValue({});
        return Ops.WebApi.getRecord('account', 'acc-id', 'name,statuscode').then(function() {
            expect(Xrm.WebApi.retrieveRecord).toHaveBeenCalledWith('account', 'acc-id', '?$select=name,statuscode');
        });
    });
});

// ---------------------------------------------------------------------------
// getRecords
// ---------------------------------------------------------------------------

describe('Ops.WebApi.getRecords', function() {
    test('calls retrieveMultipleRecords with options', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [{ id: '1' }] });
        return Ops.WebApi.getRecords('contact', '?$select=fullname').then(function(rows) {
            expect(Xrm.WebApi.retrieveMultipleRecords).toHaveBeenCalledWith('contact', '?$select=fullname', 5000);
            expect(rows.length).toBe(1);
        });
    });

    test('follows nextLink: returns combined records from both pages', function() {
        var callCount = 0;
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockImplementation(function() {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    entities: [{ id: 'page1' }],
                    nextLink: 'http://next-page'
                });
            }
            return Promise.resolve({ entities: [{ id: 'page2' }] });
        });
        return Ops.WebApi.getRecords('contact', '?$select=fullname').then(function(rows) {
            expect(rows.length).toBe(2);
            expect(rows[0].id).toBe('page1');
            expect(rows[1].id).toBe('page2');
        });
    });
});

// ---------------------------------------------------------------------------
// createRecord
// ---------------------------------------------------------------------------

describe('Ops.WebApi.createRecord', function() {
    test('calls Xrm.WebApi.createRecord', function() {
        Xrm.WebApi.createRecord = jest.fn().mockResolvedValue({ id: '{new-guid}' });
        return Ops.WebApi.createRecord('task', { subject: 'Follow up' }).then(function() {
            expect(Xrm.WebApi.createRecord).toHaveBeenCalledWith('task', { subject: 'Follow up' });
        });
    });

    test('returns normalizeGuid of result.id', function() {
        Xrm.WebApi.createRecord = jest.fn().mockResolvedValue({ id: '{A1B2C3D4-1111-2222-3333-444444444444}' });
        return Ops.WebApi.createRecord('task', {}).then(function(id) {
            expect(id).toBe('a1b2c3d4-1111-2222-3333-444444444444');
        });
    });
});

// ---------------------------------------------------------------------------
// updateRecord
// ---------------------------------------------------------------------------

describe('Ops.WebApi.updateRecord', function() {
    test('calls Xrm.WebApi.updateRecord with entityLogicalName, id, data', function() {
        Xrm.WebApi.updateRecord = jest.fn().mockResolvedValue({});
        var data = { statuscode: 2 };
        return Ops.WebApi.updateRecord('account', 'acc-id', data).then(function() {
            expect(Xrm.WebApi.updateRecord).toHaveBeenCalledWith('account', 'acc-id', data);
        });
    });
});

// ---------------------------------------------------------------------------
// deleteRecord
// ---------------------------------------------------------------------------

describe('Ops.WebApi.deleteRecord', function() {
    test('calls Xrm.WebApi.deleteRecord', function() {
        Xrm.WebApi.deleteRecord = jest.fn().mockResolvedValue({});
        return Ops.WebApi.deleteRecord('task', 'task-id').then(function() {
            expect(Xrm.WebApi.deleteRecord).toHaveBeenCalledWith('task', 'task-id');
        });
    });
});

// ---------------------------------------------------------------------------
// getFirstOrDefault
// ---------------------------------------------------------------------------

describe('Ops.WebApi.getFirstOrDefault', function() {
    test('adds $top=1 to options', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [] });
        return Ops.WebApi.getFirstOrDefault('account', "name eq 'Acme'").then(function() {
            var calledWith = Xrm.WebApi.retrieveMultipleRecords.mock.calls[0][1];
            expect(calledWith).toContain('$top=1');
        });
    });

    test('returns first entity or null', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn()
            .mockResolvedValueOnce({ entities: [{ name: 'Acme' }] });
        return Ops.WebApi.getFirstOrDefault('account', "name eq 'Acme'").then(function(result) {
            expect(result.name).toBe('Acme');
        });
    });

    test('returns null when no records found', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [] });
        return Ops.WebApi.getFirstOrDefault('account', "name eq 'Missing'").then(function(result) {
            expect(result).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// query builder
// ---------------------------------------------------------------------------

describe('Ops.WebApi.query builder', function() {
    test('.select + .where + .top + .getAll() → correct OData string', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [] });
        return Ops.WebApi.query('account')
            .select('name', 'statuscode')
            .where('statecode eq 0')
            .top(5)
            .getAll()
            .then(function() {
                var calledWith = Xrm.WebApi.retrieveMultipleRecords.mock.calls[0][1];
                expect(calledWith).toContain('$select=name,statuscode');
                expect(calledWith).toContain('$filter=statecode eq 0');
                expect(calledWith).toContain('$top=5');
            });
    });

    test('.expand with selectFields → $expand=nav($select=field)', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [] });
        return Ops.WebApi.query('account')
            .expand('primarycontactid', ['fullname'])
            .getAll()
            .then(function() {
                var calledWith = Xrm.WebApi.retrieveMultipleRecords.mock.calls[0][1];
                expect(calledWith).toContain('$expand=primarycontactid($select=fullname)');
            });
    });

    test('.expand without selectFields → $expand=nav (no select)', function() {
        Xrm.WebApi.retrieveMultipleRecords = jest.fn().mockResolvedValue({ entities: [] });
        return Ops.WebApi.query('account')
            .expand('primarycontactid')
            .getAll()
            .then(function() {
                var calledWith = Xrm.WebApi.retrieveMultipleRecords.mock.calls[0][1];
                expect(calledWith).toContain('$expand=primarycontactid');
                expect(calledWith).not.toContain('$select');
            });
    });
});

// ---------------------------------------------------------------------------
// associate
// ---------------------------------------------------------------------------

describe('Ops.WebApi.associate', function() {
    test('fetch called with POST, correct URL, correct @odata.id body', function() {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
        return Ops.WebApi.associate(
            'opportunities', 'opp-id',
            'opportunitycompetitors',
            'competitors', 'comp-id'
        ).then(function() {
            expect(global.fetch).toHaveBeenCalledTimes(1);
            var args = global.fetch.mock.calls[0];
            var url = args[0];
            var opts = args[1];
            expect(url).toContain('/opportunities(');
            expect(url).toContain('/opportunitycompetitors/$ref');
            expect(opts.method).toBe('POST');
            var body = JSON.parse(opts.body);
            expect(body['@odata.id']).toContain('/competitors(');
        });
    });

    test('throws on non-ok response', function() {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: jest.fn().mockResolvedValue('Bad request')
        });
        return Ops.WebApi.associate('opportunities', 'opp-id', 'rel', 'competitors', 'comp-id')
            .then(function() {
                throw new Error('Should have rejected');
            }, function(err) {
                expect(err.message).toContain('associate failed');
            });
    });
});

// ---------------------------------------------------------------------------
// disassociate
// ---------------------------------------------------------------------------

describe('Ops.WebApi.disassociate', function() {
    test('fetch called with DELETE, correct URL with toId in path', function() {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
        var toId = 'a1b2c3d4-1111-2222-3333-444444444444';
        return Ops.WebApi.disassociate(
            'opportunities', 'opp-id',
            'opportunitycompetitors',
            toId
        ).then(function() {
            var url = global.fetch.mock.calls[0][0];
            var opts = global.fetch.mock.calls[0][1];
            expect(url).toContain('/opportunitycompetitors(' + toId + ')/$ref');
            expect(opts.method).toBe('DELETE');
        });
    });
});

// ---------------------------------------------------------------------------
// executeAction
// ---------------------------------------------------------------------------

describe('Ops.WebApi.executeAction', function() {
    test('unbound: fetch POST to /api/data/v9.2/ActionName', function() {
        var responseBody = { result: 'ok' };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: jest.fn().mockResolvedValue(JSON.stringify(responseBody))
        });
        return Ops.WebApi.executeAction('MyAction', { Param: 1 }).then(function(result) {
            var url = global.fetch.mock.calls[0][0];
            expect(url).toBe(CLIENT_URL + '/api/data/v9.2/MyAction');
            expect(result.result).toBe('ok');
        });
    });

    test('bound: fetch POST to entitySet(id)/Microsoft.Dynamics.CRM.ActionName', function() {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 204,
            text: jest.fn().mockResolvedValue('')
        });
        return Ops.WebApi.executeAction('Qualify', {}, 'leads', 'lead-id').then(function() {
            var url = global.fetch.mock.calls[0][0];
            expect(url).toContain('/leads(');
            expect(url).toContain('/Microsoft.Dynamics.CRM.Qualify');
        });
    });
});

// ---------------------------------------------------------------------------
// winOpportunity
// ---------------------------------------------------------------------------

describe('Ops.WebApi.winOpportunity', function() {
    test('calls executeAction WinOpportunity with Status=3 and @odata.type', function() {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 204,
            text: jest.fn().mockResolvedValue('')
        });
        return Ops.WebApi.winOpportunity('opp-id').then(function() {
            var opts = global.fetch.mock.calls[0][1];
            var body = JSON.parse(opts.body);
            expect(body.Status).toBe(3);
            expect(body.OpportunityClose['@odata.type']).toBe('Microsoft.Dynamics.CRM.opportunityclose');
        });
    });
});

// ---------------------------------------------------------------------------
// loseOpportunity
// ---------------------------------------------------------------------------

describe('Ops.WebApi.loseOpportunity', function() {
    test('default statusCode=4', function() {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true, status: 204,
            text: jest.fn().mockResolvedValue('')
        });
        return Ops.WebApi.loseOpportunity('opp-id').then(function() {
            var body = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(body.Status).toBe(4);
        });
    });

    test('explicit statusCode=5 → Status=5 in body', function() {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true, status: 204,
            text: jest.fn().mockResolvedValue('')
        });
        return Ops.WebApi.loseOpportunity('opp-id', 5).then(function() {
            var body = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(body.Status).toBe(5);
        });
    });
});

// ---------------------------------------------------------------------------
// reopenOpportunity
// ---------------------------------------------------------------------------

describe('Ops.WebApi.reopenOpportunity', function() {
    test('calls updateRecord with { statecode:0, statuscode:1 }', function() {
        Xrm.WebApi.updateRecord = jest.fn().mockResolvedValue({});
        return Ops.WebApi.reopenOpportunity('opp-id').then(function() {
            expect(Xrm.WebApi.updateRecord).toHaveBeenCalledWith(
                'opportunity', 'opp-id', { statecode: 0, statuscode: 1 }
            );
        });
    });
});
