// rollup.config.ts

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
