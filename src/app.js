import sequelize from './core/database'
import server from "./core/server";
import fs from "fs";
import {coverDir, fixOnStartup, migrateOnStartup, wwwDir} from "./config/config";
import {cleanup, run} from './core/cleanup';
import migrationDatabase from "./migration/core/database";
import {fixUsComics, fixUsSeries, migrate} from "./migration/core/migration";

const shell = require('shelljs');

async function start() {
    await sequelize.authenticate();
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is up and running");

    await sequelize.sync();

    //remove that nasty constraints...
    try {
        await sequelize.queryInterface.removeConstraint('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
        await sequelize.queryInterface.removeConstraint('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
        await sequelize.queryInterface.removeConstraint('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('story_individual', 'story_individual_fk_story_fk_individual_unique');
    } catch (e) {
        //might be gone already, that's fine!
    }

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is set up");

    if (!fs.existsSync(wwwDir + '/' + coverDir))
        shell.mkdir('-p', wwwDir + '/' + coverDir);

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Coverdir is set up at " + wwwDir + "/" + coverDir);

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Starting cleanup process");

    cleanup.start();

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Cleanup process is running");

    let {url} = await server.listen();

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Server is up and running at " + url);

    if (fixOnStartup) {
        fixUsSeries();
        fixUsComics();
    }

    if (migrateOnStartup) {
        await migrationDatabase.authenticate();
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Migration Database is up and running");

        await migrationDatabase.sync();
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Migration Database is set up");

        console.log("[" + (new Date()).toUTCString() + "] 🚀 Starting migration...");

        migrate()
            .then(o => console.log("[" + (new Date()).toUTCString() + "] 🚀 Migration done! See logfile for eventual errors."))
            .catch((e) => {
                console.log("[" + (new Date()).toUTCString() + "] 🚀 Migration failed! See logfile for errors.");
            });
    }

    console.log("[" + (new Date()).toUTCString() + "] 🚀 All done, lets go!");
}

start();