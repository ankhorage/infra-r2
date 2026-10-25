import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const consumerDirectory = mkdtempSync(join(tmpdir(), 'ankhorage-infra-r2-consumer-'));
const packedDirectory = join(consumerDirectory, 'packed');
const temporaryCacheDirectory = join(tmpdir(), 'infra-r2-npm-cache');
const consumerScript = 'consumer.mjs';

try {
  mkdirSync(packedDirectory);
  const packOutput = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', packedDirectory],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: temporaryCacheDirectory },
    },
  );
  const archiveName = packOutput.trim();
  if (!archiveName.endsWith('.tgz')) {
    throw new Error('Packing @ankhorage/infra-r2 produced no archive.');
  }

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: { '@ankhorage/infra-r2': `file:${join(packedDirectory, archiveName)}` },
      devDependencies: { typescript: '~6.0.3' },
    }),
  );
  writeFileSync(
    join(consumerDirectory, 'consumer.mjs'),
    [
      "import { INFRA_ADAPTER_CATALOG, isInfraAdapterDescriptor } from '@ankhorage/contracts/infra';",
      "const adapter = await import('@ankhorage/infra-r2');",
      "if (typeof adapter.createInfraAdapter !== 'function') throw new Error('factory export is missing');",
      "if (!isInfraAdapterDescriptor(adapter.infraAdapterDescriptor)) throw new Error('descriptor is invalid');",
      "if (adapter.infraAdapterDescriptor !== INFRA_ADAPTER_CATALOG.r2) throw new Error('descriptor is not canonical');",
      "if (adapter.infraAdapterDescriptor.package !== '@ankhorage/infra-r2') throw new Error('package identity drifted');",
    ].join('\n'),
  );
  writeFileSync(
    join(consumerDirectory, 'consumer.ts'),
    [
      "import { createInfraAdapter, infraAdapterDescriptor } from '@ankhorage/infra-r2';",
      'const factory: typeof createInfraAdapter = createInfraAdapter;',
      'const packageName: string = infraAdapterDescriptor.package;',
      'void factory;',
      'void packageName;',
    ].join('\n'),
  );
  writeFileSync(
    join(consumerDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true },
    }),
  );

  execFileSync(
    'bun',
    ['install', '--ignore-scripts', '--cache-dir', join(tmpdir(), 'infra-r2-bun-cache')],
    {
      cwd: consumerDirectory,
      stdio: 'inherit',
    },
  );
  const packedManifest = JSON.parse(
    readFileSync(join(consumerDirectory, 'node_modules/@ankhorage/infra-r2/package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const invalidDependency = Object.entries(packedManifest.dependencies ?? {}).find(([, range]) =>
    /^(?:file:|link:|workspace:)/.test(range),
  );
  if (invalidDependency !== undefined) {
    throw new Error(`Packed package has a non-public dependency: ${invalidDependency[0]}.`);
  }
  execFileSync('bun', [consumerScript], { cwd: consumerDirectory, stdio: 'inherit' });
  execFileSync('node', [consumerScript], { cwd: consumerDirectory, stdio: 'inherit' });
  execFileSync('bun', ['x', 'tsc', '--project', 'tsconfig.json'], {
    cwd: consumerDirectory,
    stdio: 'inherit',
  });
} finally {
  rmSync(consumerDirectory, { recursive: true, force: true });
}
