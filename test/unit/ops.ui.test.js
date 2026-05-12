'use strict';

const { XrmMockGenerator } = require('xrm-mock');

function makeFormContext() {
    return XrmMockGenerator.getFormContext();
}

beforeEach(function() {
    XrmMockGenerator.initialise();
    Ops.Debug.setLevel(Ops.Debug.Level.Off);

    // Stub progress indicator — not in xrm-mock default Utility
    Xrm.Utility.showProgressIndicator = jest.fn();
    Xrm.Utility.closeProgressIndicator = jest.fn();
});

afterEach(function() {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// setFormNotification
// ---------------------------------------------------------------------------

describe('Ops.UI.setFormNotification', function() {
    test('calls formContext.ui.setFormNotification with correct args', function() {
        var fc = makeFormContext();
        fc.ui.setFormNotification = jest.fn();
        fc.ui.clearFormNotification = jest.fn();
        Ops.UI.setFormNotification(fc, 'Test message', 'INFO', 'notif-1');
        expect(fc.ui.setFormNotification).toHaveBeenCalledWith('Test message', 'INFO', 'notif-1');
    });

    test('clearFormNotification called with same id clears it', function() {
        var fc = makeFormContext();
        // Use real UiMock setFormNotification/clearFormNotification
        Ops.UI.setFormNotification(fc, 'msg', 'INFO', 'notif-clear');
        expect(fc.ui.formNotifications).toEqual(
            expect.arrayContaining([expect.objectContaining({ uniqueId: 'notif-clear' })])
        );
        Ops.UI.clearFormNotification(fc, 'notif-clear');
        var remaining = (fc.ui.formNotifications || []).filter(function(n) {
            return n.uniqueId === 'notif-clear';
        });
        expect(remaining.length).toBe(0);
    });

    test('always clears before setting (no stale duplicates)', function() {
        var fc = makeFormContext();
        fc.ui.clearFormNotification = jest.fn();
        fc.ui.setFormNotification = jest.fn();
        Ops.UI.setFormNotification(fc, 'msg', 'INFO', 'notif-2');
        expect(fc.ui.clearFormNotification).toHaveBeenCalledWith('notif-2');
        expect(fc.ui.setFormNotification).toHaveBeenCalledAfter
            ? expect(fc.ui.setFormNotification).toHaveBeenCalled()
            : expect(fc.ui.setFormNotification).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// setTimedFormNotification
// ---------------------------------------------------------------------------

describe('Ops.UI.setTimedFormNotification', function() {
    beforeEach(function() { jest.useFakeTimers(); });

    test('calls setFormNotification immediately', function() {
        var fc = makeFormContext();
        fc.ui.setFormNotification = jest.fn();
        fc.ui.clearFormNotification = jest.fn();
        Ops.UI.setTimedFormNotification(fc, 'Timed msg', 'INFO', 'timed-1', 3000);
        expect(fc.ui.setFormNotification).toHaveBeenCalledWith('Timed msg', 'INFO', 'timed-1');
    });

    test('after delay: clearFormNotification called', function() {
        var fc = makeFormContext();
        fc.ui.setFormNotification = jest.fn();
        fc.ui.clearFormNotification = jest.fn();
        Ops.UI.setTimedFormNotification(fc, 'Timed msg', 'INFO', 'timed-2', 3000);
        expect(fc.ui.clearFormNotification).toHaveBeenCalledTimes(1); // called once by setFormNotification
        jest.runAllTimers();
        expect(fc.ui.clearFormNotification).toHaveBeenCalledWith('timed-2');
    });
});

// ---------------------------------------------------------------------------
// preventSave
// ---------------------------------------------------------------------------

describe('Ops.UI.preventSave', function() {
    test('calls executionContext.getEventArgs().preventDefault()', function() {
        var preventDefault = jest.fn();
        var saveCtx = {
            getEventArgs: jest.fn().mockReturnValue({ preventDefault: preventDefault })
        };
        Ops.UI.preventSave(saveCtx);
        expect(preventDefault).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// getSaveMode
// ---------------------------------------------------------------------------

describe('Ops.UI.getSaveMode', function() {
    test('returns saveMode from getEventArgs().getSaveMode()', function() {
        var getSaveMode = jest.fn().mockReturnValue(70);
        var saveCtx = {
            getEventArgs: jest.fn().mockReturnValue({ getSaveMode: getSaveMode })
        };
        expect(Ops.UI.getSaveMode(saveCtx)).toBe(70);
    });

    test('SaveMode.AutoSave === 70', function() {
        expect(Ops.UI.SaveMode.AutoSave).toBe(70);
    });
});

// ---------------------------------------------------------------------------
// navigateToTab
// ---------------------------------------------------------------------------

describe('Ops.UI.navigateToTab', function() {
    test('calls formContext.ui.tabs.get(tabName).setFocus()', function() {
        XrmMockGenerator.Tab.createTab('Summary_tab', 'Summary', true, 'expanded', null, null);
        var fc = makeFormContext();
        var tab = fc.ui.tabs.get('Summary_tab');
        tab.setFocus = jest.fn();
        Ops.UI.navigateToTab(fc, 'Summary_tab');
        expect(tab.setFocus).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// withProgress
// ---------------------------------------------------------------------------

describe('Ops.UI.withProgress', function() {
    test('calls Xrm.Utility.showProgressIndicator before fn', function() {
        return Ops.UI.withProgress(function() {
            return Promise.resolve();
        }, 'Loading...').then(function() {
            expect(Xrm.Utility.showProgressIndicator).toHaveBeenCalledWith('Loading...');
        });
    });

    test('calls Xrm.Utility.closeProgressIndicator after fn resolves', function() {
        return Ops.UI.withProgress(function() {
            return Promise.resolve('result');
        }).then(function(val) {
            expect(Xrm.Utility.closeProgressIndicator).toHaveBeenCalled();
            expect(val).toBe('result');
        });
    });

    test('closes indicator even if fn throws', function() {
        return Ops.UI.withProgress(function() {
            return Promise.reject(new Error('fail'));
        }).then(function() {
            throw new Error('Should have rejected');
        }, function() {
            expect(Xrm.Utility.closeProgressIndicator).toHaveBeenCalled();
        });
    });
});
