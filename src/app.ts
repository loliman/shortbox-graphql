import { startServer } from './core/server';
import { boot } from './boot';

boot(async () => {
  const { url } = await startServer();

  console.log('[' + new Date().toUTCString() + '] 🚀 Server is up and running at ' + url);
});
