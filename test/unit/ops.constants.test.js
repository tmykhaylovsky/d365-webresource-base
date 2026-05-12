'use strict';

describe('Ops.Constants.Tables', function() {
    test('Account.logicalName === "account"', function() {
        expect(Ops.Constants.Tables.Account.logicalName).toBe('account');
    });
    test('Competitor.logicalName === "competitor"', function() {
        expect(Ops.Constants.Tables.Competitor.logicalName).toBe('competitor');
    });
    test('Opportunity.entitySetName === "opportunities"', function() {
        expect(Ops.Constants.Tables.Opportunity.entitySetName).toBe('opportunities');
    });
});

describe('Ops.Constants.Fields', function() {
    test('Opportunity.EstimatedClose === "estimatedclosedate"', function() {
        expect(Ops.Constants.Fields.Opportunity.EstimatedClose).toBe('estimatedclosedate');
    });
    test('Competitor.Name === "name"', function() {
        expect(Ops.Constants.Fields.Competitor.Name).toBe('name');
    });
    test('Account.StatusCode === "statuscode"', function() {
        expect(Ops.Constants.Fields.Account.StatusCode).toBe('statuscode');
    });
});

describe('Ops.Constants.OptionSets', function() {
    test('Opportunity.StatusCode.Won === 3', function() {
        expect(Ops.Constants.OptionSets.Opportunity.StatusCode.Won).toBe(3);
    });
    test('Opportunity.StateCode.Won === 1', function() {
        expect(Ops.Constants.OptionSets.Opportunity.StateCode.Won).toBe(1);
    });
    test('Opportunity.StateCode.Open === 0', function() {
        expect(Ops.Constants.OptionSets.Opportunity.StateCode.Open).toBe(0);
    });
    test('Account.StatusCode.Active === 1', function() {
        expect(Ops.Constants.OptionSets.Account.StatusCode.Active).toBe(1);
    });
});

describe('Ops.Constants.Relationships', function() {
    test('Opportunity.Competitors === "opportunitycompetitors"', function() {
        expect(Ops.Constants.Relationships.Opportunity.Competitors).toBe('opportunitycompetitors');
    });
});

describe('Ops.Constants — frozen objects', function() {
    test('Tables is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.Tables)).toBe(true);
    });
    test('Tables.Account is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.Tables.Account)).toBe(true);
    });
    test('Fields is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.Fields)).toBe(true);
    });
    test('Fields.Account is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.Fields.Account)).toBe(true);
    });
    test('OptionSets is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.OptionSets)).toBe(true);
    });
    test('Relationships is frozen', function() {
        expect(Object.isFrozen(Ops.Constants.Relationships)).toBe(true);
    });
});
