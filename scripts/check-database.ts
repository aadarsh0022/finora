import { closeDatabase, database } from '../apps/api/src/database/client';

try {
  const { db } = await database();
  await db.command({ ping: 1 });
  console.info('Database ping succeeded; application indexes are initialized.');
} catch {
  console.error(
    'Database check failed. Check credentials, DNS and the Atlas IP access list. No connection details were logged.',
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
