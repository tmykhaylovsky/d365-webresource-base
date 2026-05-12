// constants.js — Ops.Constants
// Central registry for entity logical names, field names, and option set values.
// Mirror of Messages.cs, ParameterNames.cs, EntityOptionSetEnum.cs from the plugin base.
//
// Setup instructions:
//   STEP 1 — Add your solution's tables to Ops.Constants.Tables
//   STEP 2 — Add field logical names per table to Ops.Constants.Fields
//   STEP 3 — Add option set integer values to Ops.Constants.OptionSets
//   STEP 4 — Add stable notification ID strings to Ops.Constants.NotificationIds
//   STEP 5 — Add tab and control Name properties to Ops.Constants.FormControls
//
// Usage in form handlers:
//   var Fields = Ops.Constants.Fields.Account;
//   var status = Ops.Form.getValue(formContext, Fields.StatusCode);
//
// IntelliSense: add jsconfig.json + npm install --save-dev @types/xrm to the repo root.
// Then add JSDoc @type annotations to your aliases for field-level autocomplete.
//
// Dependencies: none
// Load order: any — no cross-module dependencies

var Ops = Ops || {};

Ops.Constants = (function () {
    'use strict';

    // -------------------------------------------------------------------------
    // STEP 1 — Table logical names
    // Mirror of EntityLogicalName constants in the plugin base.
    // Add your solution-specific tables below the standard ones.
    // -------------------------------------------------------------------------

    var Tables = Object.freeze({
        Account:            'account',
        Contact:            'contact',
        Opportunity:        'opportunity',
        Quote:              'quote',
        SalesOrder:         'salesorder',
        Invoice:            'invoice',
        Product:            'product',
        OpportunityProduct: 'opportunityproduct'
        // STEP 1: Add solution-specific tables here:
        // MyCustomTable: 'prefix_mycustomtable'
    });

    // -------------------------------------------------------------------------
    // STEP 2 — Field logical names per table
    // Mirror of Fields.* aliases in the plugin base.
    // Add a nested object per table. Use the form editor or solution explorer
    // to find the exact logical name — publisher prefix is part of the name.
    // -------------------------------------------------------------------------

    var Fields = Object.freeze({
        Account: Object.freeze({
            AccountId:      'accountid',
            Name:           'name',
            StatusCode:     'statuscode',
            StateCode:      'statecode',
            OwnerId:        'ownerid',
            IndustryCode:   'industrycode',
            AccountNumber:  'accountnumber',
            PrimaryContact: 'primarycontactid',
            ParentAccount:  'parentaccountid'
        }),

        Contact: Object.freeze({
            ContactId:      'contactid',
            FirstName:      'firstname',
            LastName:       'lastname',
            FullName:       'fullname',
            AccountId:      'parentcustomerid',
            StatusCode:     'statuscode',
            StateCode:      'statecode'
        }),

        Opportunity: Object.freeze({
            OpportunityId:  'opportunityid',
            Name:           'name',
            StatusCode:     'statuscode',
            StateCode:      'statecode',
            EstimatedValue: 'estimatedvalue',
            EstimatedClose: 'estimatedclosedate',
            ActualClose:    'actualclosedate',
            CustomerId:     'customerid',
            OwnerId:        'ownerid',
            PipelinePhase:  'stepname'
        })

        // STEP 2: Add more tables here as needed
    });

    // -------------------------------------------------------------------------
    // STEP 3 — Option set values
    // Mirror of EntityOptionSetEnum.cs — never hardcode integers in form scripts.
    // When a value is undocumented, derive it at runtime via label match (see BEST_PRACTICES.md).
    // -------------------------------------------------------------------------

    var OptionSets = Object.freeze({
        // Shared across most tables
        StateCode: Object.freeze({
            Active:   0,
            Inactive: 1
        }),

        Account: Object.freeze({
            StatusCode: Object.freeze({
                Active:   1,
                Inactive: 2
            }),
            IndustryCode: Object.freeze({
                Accounting:         1,
                Agriculture:        2,
                Broadcasting:       3,
                Consulting:        16,
                Engineering:        8,
                FinancialServices:  9,
                Manufacturing:     20,
                Technology:         7
            })
        }),

        Opportunity: Object.freeze({
            StatusCode: Object.freeze({
                InProgress: 1,
                Won:        3,
                Canceled:   4,
                OutSold:    5
            })
        })

        // STEP 3: Add solution-specific option sets here:
        // MyCustomTable: { MyField: { OptionOne: 100000000, OptionTwo: 100000001 } }
    });

    // -------------------------------------------------------------------------
    // STEP 4 — Notification IDs
    // Stable string constants for setFormNotification calls.
    // Using constants prevents ID drift when the same notification appears in multiple handlers.
    // -------------------------------------------------------------------------

    var NotificationIds = Object.freeze({
        NavStatus:      'nav-status',
        SaveError:      'save-error',
        PermissionWarn: 'permission-warn',
        ValidationWarn: 'validation-warn',
        LoadError:      'load-error',
        DebugHint:      'debug-hint'
        // STEP 4: Add form-specific notification IDs here
    });

    // -------------------------------------------------------------------------
    // STEP 5 — Tab and control names
    // Case-sensitive Name properties from the form editor — NOT display labels.
    // Wrong values fail silently. Verify in: Form Editor → Tab/Section properties → Name.
    // -------------------------------------------------------------------------

    var FormControls = Object.freeze({
        Account: Object.freeze({
            Tabs: Object.freeze({
                // STEP 5: Replace with actual tab Name properties from your form editor
                Summary:  'SUMMARY',
                Details:  'DETAILS'
            }),
            Controls: Object.freeze({
                // STEP 5: e.g. 'WebResource_MyGrid'
            })
        }),
        Opportunity: Object.freeze({
            Tabs: Object.freeze({
                Summary:          'Summary',
                ProductLineItems: 'Product_Line_Items'
            }),
            Controls: Object.freeze({
                ProductGrid: 'WebResource_OpportunityProductsGridV2'
            })
        })
    });

    // -------------------------------------------------------------------------
    // Public surface
    // -------------------------------------------------------------------------

    return {
        Tables:          Tables,
        Fields:          Fields,
        OptionSets:      OptionSets,
        NotificationIds: NotificationIds,
        FormControls:    FormControls
    };
}());
