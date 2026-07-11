/**
 * Manage access keys for the vault.
 *
 *   npm run add-user -- --name alice           # create user, print their key
 *   npm run add-user -- --name bob --key s3cret
 *   npm run add-user -- --list                 # show all users + keys
 */
import { getDb } from '../src/db.js';
import { createUser, listUsers } from '../src/lib/users.js';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const db = getDb();

if (process.argv.includes('--list')) {
  for (const user of listUsers(db)) {
    console.log(`#${user.id}  ${user.name.padEnd(16)} key: ${user.key}`);
  }
  process.exit(0);
}

const name = arg('--name');
if (!name) {
  console.error('usage: npm run add-user -- --name <name> [--key <key>]   |   --list');
  process.exit(1);
}

try {
  const user = createUser(db, name, arg('--key') ?? undefined);
  console.log(`created user '${user.name}'`);
  console.log(`access key: ${user.key}`);
  console.log('they enter this key once on the app Home screen.');
} catch (err) {
  console.error(`failed: ${(err as Error).message} (name taken?)`);
  process.exit(1);
}
