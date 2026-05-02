import fs from 'fs';
import path from 'path';

/**
 * Common ESBuild config used for building main process source
 * code for both dev and production.
 *
 * @param {string} root
 * @returns {import('esbuild').BuildOptions}
 */
export function getMainProcessCommonConfig(root) {
  // Bake build-time secrets into the main process binary so they're available
  // at runtime via process.env.XXX without requiring the user to set them.
  const define = {};
  const secretEnvVars = [
    'BACKBLAZE_KEYID',
    'BACKBLAZE_APPLICATION_KEY',
    'BACKBLAZE_ENDPOINT',
    'BACKBLAZE_BUCKET',
  ];
  for (const key of secretEnvVars) {
    if (process.env[key]) {
      define[`process.env.${key}`] = JSON.stringify(process.env[key]);
    }
  }

  return {
    entryPoints: [
      path.join(root, 'main.ts'),
      path.join(root, 'main', 'preload.ts'),
    ],
    bundle: true,
    sourcemap: true,
    sourcesContent: false,
    platform: 'node',
    target: 'node20',
    external: ['knex', 'electron', 'better-sqlite3', 'electron-store'],
    plugins: [excludeVendorFromSourceMap],
    write: true,
    define: Object.keys(define).length ? define : undefined,
  };
}

/**
 * ESBuild plugin used to prevent source maps from being generated for
 * packages inside node_modules, only first-party code source maps
 * are to be included.
 *
 * Note, this is used only for the main process source code.
 *
 * source: https://github.com/evanw/esbuild/issues/1685#issuecomment-944916409
 * @type {import('esbuild').Plugin}
 */
export const excludeVendorFromSourceMap = {
  name: 'excludeVendorFromSourceMap',
  setup(build) {
    build.onLoad({ filter: /node_modules/ }, (args) => {
      if (args.path.endsWith('.json')) {
        return;
      }

      return {
        contents:
          fs.readFileSync(args.path, 'utf8') +
          '\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==',
        loader: 'default',
      };
    });
  },
};
