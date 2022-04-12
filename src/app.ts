import server from './core/server';
import {Model} from 'objection';
import {knex} from './core/database';
import {Config} from './config/config';
import * as fs from 'fs';
import {migrate} from './migration/core/migration';
const shell = require('shelljs');

async function start() {
  Model.knex(knex);
  console.log(
    '[' + new Date().toUTCString() + '] 🚀 Database is up and running'
  );

  console.log(
    '[' + new Date().toUTCString() + '] 🚀 Creating cover directory...'
  );

  if (!fs.existsSync(Config.WWW_DIR + '/' + Config.COVER_DIR))
    shell.mkdir('-p', Config.WWW_DIR + '/' + Config.COVER_DIR);

  console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');

  console.log(
    '[' +
      new Date().toUTCString() +
      '] 🚀 Coverdir is set up at ' +
      Config.WWW_DIR +
      '/' +
      Config.COVER_DIR
  );

  if (!Config.MIGRATE_ON_STARTUP) {
    console.log(
      '[' + new Date().toUTCString() + '] 🚀 Starting cleanup process...'
    );

    //TODO cleanup.start();
    //TODO run();
    console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');
  }

  const {url} = await server.listen();

  console.log(
    '[' + new Date().toUTCString() + '] 🚀 Server is up and running at ' + url
  );

  if (Config.MIGRATE_ON_STARTUP) {
    console.log('[' + new Date().toUTCString() + '] 🚀 Starting migration...');

    migrate();
  }

  console.log('[' + new Date().toUTCString() + '] 🚀 All done, lets go!');
}

start();
