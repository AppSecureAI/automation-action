// rollup.config.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import pluginJson from '@rollup/plugin-json'

function makeConfig(input, file) {
  return {
    input,
    output: {
      esModule: true,
      file,
      format: 'es',
      sourcemap: true
    },
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      pluginJson()
    ]
  }
}

const config = [
  makeConfig('src/index.ts', 'dist/index.js'),
  makeConfig('src/cleanup.ts', 'dist/cleanup.js')
]

export default config
