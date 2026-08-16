const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/index.js',
    output: {
        filename: 'index.bundle.v3.41.js',
        path: path.resolve(__dirname),  // output thẳng ra root, không dùng dist/
    },
    resolve: {
        fallback: {
            "stream": false,
            "crypto": false,
            "path": false,
            "fs": false,
            "buffer": false,
        }
    },
    performance: {
        hints: false
    }
};
