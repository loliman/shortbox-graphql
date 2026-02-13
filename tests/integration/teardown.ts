import { closeDatabase } from './seed';

export default async function teardown() {
  await closeDatabase();
}
