'use strict';

// ---------------------------------------------------------------------------
// isNullOrEmpty
// ---------------------------------------------------------------------------

describe('Ops.Util.isNullOrEmpty', function() {
    test('null → true', function() { expect(Ops.Util.isNullOrEmpty(null)).toBe(true); });
    test('undefined → true', function() { expect(Ops.Util.isNullOrEmpty(undefined)).toBe(true); });
    test("'' → true", function() { expect(Ops.Util.isNullOrEmpty('')).toBe(true); });
    test("'   ' → true", function() { expect(Ops.Util.isNullOrEmpty('   ')).toBe(true); });
    test("'hi' → false", function() { expect(Ops.Util.isNullOrEmpty('hi')).toBe(false); });
    test('0 → false (not null/undefined, stringifies to "0")', function() { expect(Ops.Util.isNullOrEmpty(0)).toBe(false); });
    test('false → false (stringifies to "false")', function() { expect(Ops.Util.isNullOrEmpty(false)).toBe(false); });
});

// ---------------------------------------------------------------------------
// isNullOrUndefined
// ---------------------------------------------------------------------------

describe('Ops.Util.isNullOrUndefined', function() {
    test('null → true', function() { expect(Ops.Util.isNullOrUndefined(null)).toBe(true); });
    test('undefined → true', function() { expect(Ops.Util.isNullOrUndefined(undefined)).toBe(true); });
    test('0 → false', function() { expect(Ops.Util.isNullOrUndefined(0)).toBe(false); });
    test("'' → false", function() { expect(Ops.Util.isNullOrUndefined('')).toBe(false); });
    test('false → false', function() { expect(Ops.Util.isNullOrUndefined(false)).toBe(false); });
});

// ---------------------------------------------------------------------------
// normalizeGuid
// ---------------------------------------------------------------------------

describe('Ops.Util.normalizeGuid', function() {
    test('strips braces and lowercases', function() {
        expect(Ops.Util.normalizeGuid('{A1B2C3D4-1111-2222-3333-444444444444}'))
            .toBe('a1b2c3d4-1111-2222-3333-444444444444');
    });
    test('already lowercase, no braces — unchanged', function() {
        expect(Ops.Util.normalizeGuid('a1b2c3d4-1111-2222-3333-444444444444'))
            .toBe('a1b2c3d4-1111-2222-3333-444444444444');
    });
    test('uppercased no braces — lowercased', function() {
        expect(Ops.Util.normalizeGuid('A1B2C3D4-1111-2222-3333-444444444444'))
            .toBe('a1b2c3d4-1111-2222-3333-444444444444');
    });
    test('null → null', function() {
        expect(Ops.Util.normalizeGuid(null)).toBeNull();
    });
    test('undefined → null', function() {
        expect(Ops.Util.normalizeGuid(undefined)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// isValidGuid
// ---------------------------------------------------------------------------

describe('Ops.Util.isValidGuid', function() {
    test('valid lowercase without braces → true', function() {
        expect(Ops.Util.isValidGuid('a1b2c3d4-1111-2222-3333-444444444444')).toBe(true);
    });
    test('valid uppercase with braces → true', function() {
        expect(Ops.Util.isValidGuid('{A1B2C3D4-1111-2222-3333-444444444444}')).toBe(true);
    });
    test('too short → false', function() {
        expect(Ops.Util.isValidGuid('a1b2c3d4-1111-2222-3333')).toBe(false);
    });
    test('random string → false', function() {
        expect(Ops.Util.isValidGuid('not-a-guid')).toBe(false);
    });
    test('null → false', function() {
        expect(Ops.Util.isValidGuid(null)).toBe(false);
    });
    test('empty string → false', function() {
        expect(Ops.Util.isValidGuid('')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// newGuid
// ---------------------------------------------------------------------------

describe('Ops.Util.newGuid', function() {
    test('matches RFC 4122 format', function() {
        var guid = Ops.Util.newGuid();
        expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
    test('length is 36', function() {
        expect(Ops.Util.newGuid().length).toBe(36);
    });
    test('two calls produce different values', function() {
        expect(Ops.Util.newGuid()).not.toBe(Ops.Util.newGuid());
    });
});

// ---------------------------------------------------------------------------
// toWebApiDateOnly
// ---------------------------------------------------------------------------

describe('Ops.Util.toWebApiDateOnly', function() {
    test('Jan 15 local → "2025-01-15"', function() {
        var d = new Date(2025, 0, 15); // local midnight
        expect(Ops.Util.toWebApiDateOnly(d)).toBe('2025-01-15');
    });
    test('null → null', function() {
        expect(Ops.Util.toWebApiDateOnly(null)).toBeNull();
    });
    test('invalid string → null', function() {
        expect(Ops.Util.toWebApiDateOnly('not-a-date')).toBeNull();
    });
    test('Dec 31 local → correct string', function() {
        var d = new Date(2024, 11, 31);
        expect(Ops.Util.toWebApiDateOnly(d)).toBe('2024-12-31');
    });
});

// ---------------------------------------------------------------------------
// toLocalMidnightDate
// ---------------------------------------------------------------------------

describe('Ops.Util.toLocalMidnightDate', function() {
    test('"2026-04-02T00:00:00Z" → local midnight on Apr 2', function() {
        var result = Ops.Util.toLocalMidnightDate('2026-04-02T00:00:00Z');
        expect(result).not.toBeNull();
        expect(result.getDate()).toBe(2);
        expect(result.getMonth()).toBe(3); // April = 3
        expect(result.getFullYear()).toBe(2026);
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
    });
    test('null → null', function() {
        expect(Ops.Util.toLocalMidnightDate(null)).toBeNull();
    });
    test('empty string → null', function() {
        expect(Ops.Util.toLocalMidnightDate('')).toBeNull();
    });
    test('invalid string → null', function() {
        expect(Ops.Util.toLocalMidnightDate('not-a-date')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// parseWebApiDate
// ---------------------------------------------------------------------------

describe('Ops.Util.parseWebApiDate', function() {
    test('"2025-01-15" → local midnight Jan 15', function() {
        var d = Ops.Util.parseWebApiDate('2025-01-15');
        expect(d instanceof Date).toBe(true);
        expect(d.getFullYear()).toBe(2025);
        expect(d.getMonth()).toBe(0);
        expect(d.getDate()).toBe(15);
        expect(d.getHours()).toBe(0);
    });
    test('"2025-01-15T00:00:00Z" → valid Date object', function() {
        var d = Ops.Util.parseWebApiDate('2025-01-15T00:00:00Z');
        expect(d instanceof Date).toBe(true);
        expect(isNaN(d.getTime())).toBe(false);
    });
    test('null → null', function() {
        expect(Ops.Util.parseWebApiDate(null)).toBeNull();
    });
    test('empty string → null', function() {
        expect(Ops.Util.parseWebApiDate('')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

describe('Ops.Util.debounce', function() {
    beforeEach(function() { jest.useFakeTimers(); });
    afterEach(function() { jest.useRealTimers(); });

    test('fires once after delay even with rapid calls', function() {
        var fn = jest.fn();
        var debounced = Ops.Util.debounce(fn, 300);

        debounced();
        debounced();
        debounced();
        expect(fn).not.toHaveBeenCalled();

        jest.runAllTimers();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('does not fire before the delay elapses', function() {
        var fn = jest.fn();
        var debounced = Ops.Util.debounce(fn, 300);

        debounced();
        jest.advanceTimersByTime(100);
        expect(fn).not.toHaveBeenCalled();

        jest.runAllTimers();
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// singleFlight
// ---------------------------------------------------------------------------

describe('Ops.Util.singleFlight', function() {
    test('second call while first is pending returns immediately', function() {
        var resolveFirst;
        var callCount = 0;
        var fn = Ops.Util.singleFlight(function() {
            callCount++;
            return new Promise(function(resolve) { resolveFirst = resolve; });
        });

        var p1 = fn();
        var p2 = fn(); // running=true already set, second call is a no-op

        // asyncFn runs inside Promise.resolve().then() — let microtasks flush first
        return Promise.resolve().then(function() {
            expect(callCount).toBe(1);
            resolveFirst('done');
            return Promise.all([p1, p2]);
        });
    });

    test('first call resolves normally', function() {
        var fn = Ops.Util.singleFlight(function() {
            return Promise.resolve(42);
        });
        return fn().then(function(v) { expect(v).toBe(42); });
    });

    test('second call is allowed after first resolves', function() {
        var callCount = 0;
        var fn = Ops.Util.singleFlight(function() {
            callCount++;
            return Promise.resolve();
        });
        return fn().then(function() {
            return fn();
        }).then(function() {
            expect(callCount).toBe(2);
        });
    });
});

// ---------------------------------------------------------------------------
// dedupe
// ---------------------------------------------------------------------------

describe('Ops.Util.dedupe', function() {
    test('two concurrent calls with same key share one promise', function() {
        var callCount = 0;
        var factory = function() {
            callCount++;
            return Promise.resolve('result');
        };

        var p1 = Ops.Util.dedupe('test-key-dedupe', factory);
        var p2 = Ops.Util.dedupe('test-key-dedupe', factory);

        // _inFlight is set synchronously so p1 === p2; callCount check needs microtask flush
        expect(p1).toBe(p2);
        return p1.then(function() {
            expect(callCount).toBe(1);
        });
    });

    test('second call after settlement starts a new request', function() {
        var callCount = 0;
        var factory = function() {
            callCount++;
            return Promise.resolve('result');
        };

        return Ops.Util.dedupe('test-key-settle', factory).then(function() {
            return Ops.Util.dedupe('test-key-settle', factory);
        }).then(function() {
            expect(callCount).toBe(2);
        });
    });
});

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------

describe('Ops.Util.pick', function() {
    test('extracts only named keys', function() {
        var obj = { a: 1, b: 2, c: 3 };
        expect(Ops.Util.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });
    test('ignores keys not present in obj', function() {
        var obj = { a: 1 };
        expect(Ops.Util.pick(obj, ['a', 'missing'])).toEqual({ a: 1 });
    });
    test('null obj → {}', function() {
        expect(Ops.Util.pick(null, ['a'])).toEqual({});
    });
    test('empty keys → {}', function() {
        expect(Ops.Util.pick({ a: 1 }, [])).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('Ops.Util.get', function() {
    test('dot-notation path resolves correctly', function() {
        var obj = { a: { b: { c: 42 } } };
        expect(Ops.Util.get(obj, 'a.b.c')).toBe(42);
    });
    test('null intermediate returns undefined (no throw)', function() {
        var obj = { a: null };
        expect(Ops.Util.get(obj, 'a.b.c')).toBeUndefined();
    });
    test('missing key returns undefined', function() {
        expect(Ops.Util.get({ a: 1 }, 'b')).toBeUndefined();
    });
    test('null obj → undefined', function() {
        expect(Ops.Util.get(null, 'a')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('Ops.Util.truncate', function() {
    test('truncates with default suffix "..."', function() {
        expect(Ops.Util.truncate('Hello World', 8)).toBe('Hello...');
    });
    test('no-op when string fits within maxLen', function() {
        expect(Ops.Util.truncate('Hi', 8)).toBe('Hi');
    });
    test('custom suffix', function() {
        expect(Ops.Util.truncate('Hello World', 8, '…')).toBe('Hello W…');
    });
    test('empty string → empty string', function() {
        expect(Ops.Util.truncate('', 5)).toBe('');
    });
    test('null → empty string', function() {
        expect(Ops.Util.truncate(null, 5)).toBe('');
    });
});
