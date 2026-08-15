import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const communityServiceRoot = path.join(repositoryRoot, 'services', 'community-service');
const testDatabaseUrl = process.env.COMMUNITY_TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('COMMUNITY_TEST_DATABASE_URL is required for community-service tests.');
}

const parsed = new URL(testDatabaseUrl);
if (parsed.searchParams.get('schema') !== 'community_test') {
  throw new Error('COMMUNITY_TEST_DATABASE_URL must target the isolated community_test schema.');
}

const environment = { ...process.env, COMMUNITY_DATABASE_URL: testDatabaseUrl };

function run(args: string[], cwd = repositoryRoot) {
  const result = spawnSync(process.execPath, args, { cwd, env: environment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([
  path.join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js'),
  'migrate',
  'deploy',
  '--schema',
  path.join(repositoryRoot, 'services', 'community-service', 'prisma', 'schema.prisma'),
]);
run([path.join(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--no-file-parallelism'], communityServiceRoot);
