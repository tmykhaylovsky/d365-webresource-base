'use strict';

const { XrmMockGenerator } = require('xrm-mock');

beforeEach(function() {
    XrmMockGenerator.initialise();
    Ops.Debug.setLevel(Ops.Debug.Level.Off);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFormContext() {
    return XrmMockGenerator.getFormContext();
}

// ---------------------------------------------------------------------------
// getValue
// ---------------------------------------------------------------------------

describe('Ops.Form.getValue', function() {
    test('returns value for existing string attribute', function() {
        XrmMockGenerator.Attribute.createString('name', 'Acme Corp');
        expect(Ops.Form.getValue(getFormContext(), 'name')).toBe('Acme Corp');
    });

    test('returns null for absent attribute (no throw)', function() {
        expect(Ops.Form.getValue(getFormContext(), 'missing')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// setValue
// ---------------------------------------------------------------------------

describe('Ops.Form.setValue', function() {
    test('sets value; subsequent getValue returns it', function() {
        XrmMockGenerator.Attribute.createString('name', 'Before');
        var fc = getFormContext();
        Ops.Form.setValue(fc, 'name', 'After');
        expect(Ops.Form.getValue(fc, 'name')).toBe('After');
    });

    test('no-op if attribute absent (no throw)', function() {
        expect(function() {
            Ops.Form.setValue(getFormContext(), 'missing', 'x');
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getLookupValue
// ---------------------------------------------------------------------------

describe('Ops.Form.getLookupValue', function() {
    test('returns first item from lookup array', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{c-guid}', entityType: 'contact', name: 'Jane Smith' }]);
        var lv = Ops.Form.getLookupValue(getFormContext(), 'primarycontactid');
        expect(lv).not.toBeNull();
        expect(lv.name).toBe('Jane Smith');
    });

    test('returns null when lookup is empty array', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid', []);
        expect(Ops.Form.getLookupValue(getFormContext(), 'primarycontactid')).toBeNull();
    });

    test('returns null when attribute absent', function() {
        expect(Ops.Form.getLookupValue(getFormContext(), 'missing')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getLookupId
// ---------------------------------------------------------------------------

describe('Ops.Form.getLookupId', function() {
    test('returns normalized GUID (no braces, lowercase)', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{C1B2C3D4-1111-2222-3333-444444444444}', entityType: 'contact', name: 'Jane Smith' }]);
        var id = Ops.Form.getLookupId(getFormContext(), 'primarycontactid');
        expect(id).toBe('c1b2c3d4-1111-2222-3333-444444444444');
    });

    test('returns null when lookup is empty', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid', []);
        expect(Ops.Form.getLookupId(getFormContext(), 'primarycontactid')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getLookupName
// ---------------------------------------------------------------------------

describe('Ops.Form.getLookupName', function() {
    test('returns name string', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{c-guid}', entityType: 'contact', name: 'Jane Smith' }]);
        expect(Ops.Form.getLookupName(getFormContext(), 'primarycontactid')).toBe('Jane Smith');
    });

    test('returns null when empty', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid', []);
        expect(Ops.Form.getLookupName(getFormContext(), 'primarycontactid')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getLookupEntityType
// ---------------------------------------------------------------------------

describe('Ops.Form.getLookupEntityType', function() {
    test('returns entityType string', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{c-guid}', entityType: 'contact', name: 'Jane Smith' }]);
        expect(Ops.Form.getLookupEntityType(getFormContext(), 'primarycontactid')).toBe('contact');
    });
});

// ---------------------------------------------------------------------------
// setLookupValue
// ---------------------------------------------------------------------------

describe('Ops.Form.setLookupValue', function() {
    test('sets lookup via array wrap', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{old-guid}', entityType: 'contact', name: 'Old' }]);
        var fc = getFormContext();
        Ops.Form.setLookupValue(fc, 'primarycontactid',
            { id: '{new-guid}', entityType: 'contact', name: 'New' });
        var lv = Ops.Form.getLookupValue(fc, 'primarycontactid');
        expect(lv.name).toBe('New');
    });

    test('pass null → clears lookup (getValue returns null)', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{c-guid}', entityType: 'contact', name: 'Jane' }]);
        var fc = getFormContext();
        Ops.Form.setLookupValue(fc, 'primarycontactid', null);
        expect(Ops.Form.getLookupValue(fc, 'primarycontactid')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// clearLookup
// ---------------------------------------------------------------------------

describe('Ops.Form.clearLookup', function() {
    test('equivalent to setLookupValue(null)', function() {
        XrmMockGenerator.Attribute.createLookup('primarycontactid',
            [{ id: '{c-guid}', entityType: 'contact', name: 'Jane' }]);
        var fc = getFormContext();
        Ops.Form.clearLookup(fc, 'primarycontactid');
        expect(Ops.Form.getLookupValue(fc, 'primarycontactid')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getOptionSetText
// ---------------------------------------------------------------------------

describe('Ops.Form.getOptionSetText', function() {
    test('returns getText() from attribute', function() {
        XrmMockGenerator.Attribute.createOptionSet('statuscode', 1,
            [{ text: 'InProgress', value: 1 }, { text: 'Won', value: 3 }]);
        expect(Ops.Form.getOptionSetText(getFormContext(), 'statuscode')).toBe('InProgress');
    });

    test('returns null when absent', function() {
        expect(Ops.Form.getOptionSetText(getFormContext(), 'missing')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// applyFieldStates
// ---------------------------------------------------------------------------

describe('Ops.Form.applyFieldStates', function() {
    test('required:true → setRequiredLevel("required")', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        Ops.Form.applyFieldStates(fc, [{ name: 'name', required: true }]);
        expect(fc.getAttribute('name').getRequiredLevel()).toBe('required');
    });

    test('required:false → setRequiredLevel("none")', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        Ops.Form.applyFieldStates(fc, [{ name: 'name', required: false }]);
        expect(fc.getAttribute('name').getRequiredLevel()).toBe('none');
    });

    test('disabled:true → control.setDisabled(true)', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        Ops.Form.applyFieldStates(fc, [{ name: 'name', disabled: true }]);
        expect(fc.getControl('name').getDisabled()).toBe(true);
    });

    test('visible:false → control.setVisible(false)', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        Ops.Form.applyFieldStates(fc, [{ name: 'name', visible: false }]);
        expect(fc.getControl('name').getVisible()).toBe(false);
    });

    test('partial spec (only required) → only required changes', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        var ctrl = fc.getControl('name');
        var visibleBefore = ctrl.getVisible();
        Ops.Form.applyFieldStates(fc, [{ name: 'name', required: true }]);
        expect(ctrl.getVisible()).toBe(visibleBefore);
    });
});

// ---------------------------------------------------------------------------
// addOnChange
// ---------------------------------------------------------------------------

describe('Ops.Form.addOnChange', function() {
    test('handler fires when onChange triggered', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        var fired = 0;
        function handler() { fired++; }
        Ops.Form.addOnChange(fc, 'name', handler);
        fc.getAttribute('name').fireOnChange();
        expect(fired).toBe(1);
    });

    test('remove-then-add: calling twice → handler fires once, not twice', function() {
        XrmMockGenerator.Attribute.createString('name', 'Test');
        var fc = getFormContext();
        var fired = 0;
        function handler() { fired++; }
        Ops.Form.addOnChange(fc, 'name', handler);
        Ops.Form.addOnChange(fc, 'name', handler);
        fc.getAttribute('name').fireOnChange();
        expect(fired).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// isCreateForm / isUpdateForm
// ---------------------------------------------------------------------------

describe('Ops.Form.isCreateForm / isUpdateForm', function() {
    test('form type 1 → isCreateForm true', function() {
        // XrmMockGenerator initialises with formType 1 (Create) by default
        var fc = getFormContext();
        expect(Ops.Form.isCreateForm(fc)).toBe(true);
        expect(Ops.Form.isUpdateForm(fc)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isDirty / isAttributeDirty
// ---------------------------------------------------------------------------

describe('Ops.Form.isDirty / isAttributeDirty', function() {
    test('setValue → attribute isDirty true', function() {
        XrmMockGenerator.Attribute.createString('name', 'Before');
        var fc = getFormContext();
        Ops.Form.setValue(fc, 'name', 'After');
        expect(Ops.Form.isAttributeDirty(fc, 'name')).toBe(true);
    });

    test('unchanged attribute → isDirty false', function() {
        XrmMockGenerator.Attribute.createString('name', 'Unchanged');
        var fc = getFormContext();
        expect(Ops.Form.isAttributeDirty(fc, 'name')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// setSectionVisible
// ---------------------------------------------------------------------------

describe('Ops.Form.setSectionVisible', function() {
    test('calls section.setVisible with correct boolean', function() {
        var fc = getFormContext();
        XrmMockGenerator.Tab.createTab('Summary_tab', 'Summary', true, 'expanded', null, null);
        var tab = fc.ui.tabs.get('Summary_tab');
        var sectionVisible = true;
        var section = {
            getName: function() { return 'General_section'; },
            setVisible: function(v) { sectionVisible = v; },
            getVisible: function() { return sectionVisible; }
        };
        tab.sections.itemCollection.push(section);

        Ops.Form.setSectionVisible(fc, 'Summary_tab', 'General_section', false);
        expect(sectionVisible).toBe(false);
    });

    test('no throw when tab absent', function() {
        expect(function() {
            Ops.Form.setSectionVisible(getFormContext(), 'NonExistent_tab', 'Any_section', true);
        }).not.toThrow();
    });
});
