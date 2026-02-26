import { defineConfig } from 'tsup';

export default defineConfig(options => ({
  entry: ['src/index.ts'],
  format: ['esm'], // Dual format: ESM for web, CJS for Node (optionally ESM too)
  outDir: 'dist',
  splitting: false, // Flat output, easier for consumers
  sourcemap: true, // Helpful for debugging
  dts: true, // Type declarations
  clean: true,
  target: 'node18', // ✅ Use Node 18 baseline (modern features)
  treeshake: true,
  external: [
    'react',
    'react-dom',
    '@tanstack/react-query',
    '@provablehq/aleo-wallet-adaptor-react',
    '@provablehq/aleo-wallet-adaptor-core',
    '@provablehq/aleo-wallet-adaptor-leo',
    '@provablehq/aleo-wallet-adaptor-fox',
    '@provablehq/aleo-wallet-adaptor-puzzle',
    '@provablehq/aleo-wallet-adaptor-shield',
    '@provablehq/aleo-wallet-adaptor-soter',
    '@provablehq/aleo-wallet-standard',
    '@provablehq/aleo-types',
    '@provablehq/sdk',
  ],
  esbuildOptions(options) {
    options.platform = 'neutral'; // Don't assume node/browser — supports both
    options.mainFields = ['module', 'main'];
  },
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs', // Explicit extensions
    };
  },
}));
