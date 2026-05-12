'use strict';

// Stub Web Crypto API for Ops.Util.newGuid (not available in Node test environment)
if (typeof global.crypto === 'undefined') {
    global.crypto = {
        getRandomValues: function(buf) {
            const nodeCrypto = require('crypto');
            nodeCrypto.randomFillSync(buf);
            return buf;
        }
    };
}

// Load Ops.* source files via require() so Jest's transform pipeline (iife-loader.js)
// instruments them before execution. Istanbul can then attribute coverage to real src/ paths.
// Load order mirrors D365 script dependency order.
global.Ops = global.Ops || {};

require('../../src/debug.js');
require('../../src/util.js');
require('../../src/constants.js');
require('../../src/form.js');
require('../../src/webapi.js');
require('../../src/ui.js');
