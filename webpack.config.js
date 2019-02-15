// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

const path = require('path');

module.exports = function (env, argv) {
    env = env || {};
    return [{
        name: 'extension',
        target: 'node',
        mode: 'none',
        entry: {
          extension: './src/extension.ts'
        },
        module: {
          rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: 'ts-loader'
          }]
        },
        resolve: {
          modules: ['node_modules', path.resolve(__dirname, 'src')],
          mainFiles: ['index'],
          extensions: ['.js', '.ts', '.json']
        },
        output: {
          filename: '[name].js',
          path: path.resolve(__dirname, 'dist'),
          libraryTarget: "commonjs2",
          publicPath: '/',
          devtoolModuleFilenameTemplate: "../[resource-path]"
        },
        externals: {
          vscode: 'commonjs vscode'
        },
        devtool: 'source-map'
      }];
};