'use strict';

// Jest transform for browser IIFE source files (src/*.js).
// Strips the Ops namespace guard and wraps as a CJS module that mutates global.Ops.
// Running through the transform pipeline lets Istanbul instrument the source at load
// time, so coverage is attributed to real src/ file paths instead of <anonymous>.
module.exports = {
    process(src) {
        const code = src.replace(/^var Ops = Ops \|\| \{\};\s*\n/m, '');
        return {
            code: `'use strict';\n(function(Ops){\n${code}\n})(global.Ops = global.Ops || {});`
        };
    }
};
