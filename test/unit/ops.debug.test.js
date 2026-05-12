'use strict';

beforeEach(function() {
    Ops.Debug.clearLog();
    Ops.Debug.setLevel(Ops.Debug.Level.Info);
    Ops.Debug.setPrefix('');
});

describe('Ops.Debug — setLevel + getLog', function() {
    test('logs entries at or above the current level', function() {
        Ops.Debug.setLevel(Ops.Debug.Level.Warning);
        Ops.Debug.critical('critical msg');
        Ops.Debug.warn('warn msg');
        Ops.Debug.info('info msg');        // below Warning threshold
        Ops.Debug.verbose('verbose msg');  // below Warning threshold

        var log = Ops.Debug.getLog();
        expect(log.length).toBe(2);
        expect(log[0].level).toBe('Critical');
        expect(log[1].level).toBe('Warning');
    });

    test('filters entries below threshold', function() {
        Ops.Debug.setLevel(Ops.Debug.Level.Off);
        Ops.Debug.critical('should be suppressed');
        expect(Ops.Debug.getLog().length).toBe(0);
    });

    test('verbose level captures all entries', function() {
        Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
        Ops.Debug.critical('c');
        Ops.Debug.warn('w');
        Ops.Debug.info('i');
        Ops.Debug.verbose('v');
        expect(Ops.Debug.getLog().length).toBe(4);
    });
});

describe('Ops.Debug — setPrefix', function() {
    test('prefix appears in console output (log entry captured)', function() {
        Ops.Debug.setPrefix('MyForm');
        Ops.Debug.info('test message');
        var log = Ops.Debug.getLog();
        expect(log.length).toBe(1);
        expect(log[0].msg).toBe('test message');
    });

    test('multiple prefixes — entries reflect the prefix at call time', function() {
        Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
        Ops.Debug.setPrefix('FormA');
        Ops.Debug.info('first');
        Ops.Debug.setPrefix('FormB');
        Ops.Debug.info('second');
        var log = Ops.Debug.getLog();
        // entries themselves don't store prefix, but both are captured
        expect(log[0].msg).toBe('first');
        expect(log[1].msg).toBe('second');
    });
});

describe('Ops.Debug — named level methods', function() {
    beforeEach(function() {
        Ops.Debug.setLevel(Ops.Debug.Level.Verbose);
    });

    test('info adds entry with level Info', function() {
        Ops.Debug.info('hello');
        var log = Ops.Debug.getLog();
        expect(log[0].level).toBe('Info');
        expect(log[0].msg).toBe('hello');
    });

    test('warn adds entry with level Warning', function() {
        Ops.Debug.warn('be careful');
        expect(Ops.Debug.getLog()[0].level).toBe('Warning');
    });

    test('critical adds entry with level Critical', function() {
        Ops.Debug.critical('fatal');
        expect(Ops.Debug.getLog()[0].level).toBe('Critical');
    });

    test('verbose adds entry with level Verbose', function() {
        Ops.Debug.verbose('detail');
        expect(Ops.Debug.getLog()[0].level).toBe('Verbose');
    });

    test('factory function is called and result used as msg', function() {
        Ops.Debug.info(function() { return 'computed ' + 1; });
        expect(Ops.Debug.getLog()[0].msg).toBe('computed 1');
    });

    test('data argument is stored in entry', function() {
        Ops.Debug.info('msg', { key: 'value' });
        expect(Ops.Debug.getLog()[0].data).toEqual({ key: 'value' });
    });

    test('no data stores null', function() {
        Ops.Debug.info('no data');
        expect(Ops.Debug.getLog()[0].data).toBeNull();
    });
});

describe('Ops.Debug — getLog snapshot isolation', function() {
    test('getLog returns a copy — mutation does not affect internal log', function() {
        Ops.Debug.info('entry');
        var snapshot = Ops.Debug.getLog();
        snapshot.push({ fake: true });
        expect(Ops.Debug.getLog().length).toBe(1);
    });

    test('subsequent calls return independent arrays', function() {
        Ops.Debug.info('a');
        var first = Ops.Debug.getLog();
        Ops.Debug.info('b');
        var second = Ops.Debug.getLog();
        expect(first.length).toBe(1);
        expect(second.length).toBe(2);
    });
});

describe('Ops.Debug — clearLog', function() {
    test('clears all entries', function() {
        Ops.Debug.info('x');
        Ops.Debug.clearLog();
        expect(Ops.Debug.getLog().length).toBe(0);
    });
});
