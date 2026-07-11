import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SUPABASE_VAULT_MIGRATION_ID, SUPABASE_VAULT_MIGRATION_SQL } from '../src/migration';

const workdir = process.argv[2]?.trim() || '.integration-supabase';
const migrationDirectory = join(workdir, 'supabase', 'migrations');
const migrationPath = join(migrationDirectory, `${SUPABASE_VAULT_MIGRATION_ID}.sql`);

await mkdir(migrationDirectory, { recursive: true });
await writeFile(migrationPath, `${SUPABASE_VAULT_MIGRATION_SQL.trim()}\n`, 'utf8');

console.log(migrationPath);
