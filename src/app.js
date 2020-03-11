import sequelize from './core/database'
import server from "./core/server";
import fs from "fs";
import {coverDir, fixOnStartup, migrateOnStartup, wwwDir} from "./config/config";
import {cleanup, run} from './core/cleanup';
import migrationDatabase from "./migration/core/database";
import {fixUsComics, fixUsSeries, migrate} from "./migration/core/migration";
import {fix} from "./core/fixer";
import {Logger} from "./core/logger";
const shell = require('shelljs');

async function start() {
    Logger.initialize();
    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Logger initialized");

    await sequelize.authenticate();
    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Database is up and running");

    await sequelize.sync();

    //remove that nasty constraints...
    try {
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Removing constraints from Database...");

        await sequelize.queryInterface.removeConstraint('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
        await sequelize.queryInterface.removeConstraint('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
        await sequelize.queryInterface.removeConstraint('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('story_individual', 'story_individual_fk_story_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('story_appearance', 'story_appearance_fk_story_fk_appearance_unique');

        await sequelize.queryInterface.removeConstraint('Cover_Individual', 'Cover_Individual_fk_individual_fk_cover_unique');
        await sequelize.queryInterface.removeConstraint('Feature_Individual', 'Feature_Individual_fk_individual_fk_feature_unique');
        await sequelize.queryInterface.removeConstraint('Issue_Individual', 'Issue_Individual_fk_issue_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('Story_Individual', 'Story_Individual_fk_story_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('Story_Appearance', 'Story_Appearance_fk_story_fk_appearance_unique');
    } catch (e) {
        //might be gone already, that's fine!
    } finally {
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    try {
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Creating stored procedures...");

        let sql = await fs.readFileSync('./functions.sql');
        await sequelize.query(sql.toString());
    } catch (e) {
        //might already exist
    } finally {
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Database is all set up");

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Creating cover directory...");

    if (!fs.existsSync(wwwDir + '/' + coverDir))
        shell.mkdir('-p', wwwDir + '/' + coverDir);

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Coverdir is set up at " + wwwDir + "/" + coverDir);

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Starting cleanup process...");

    cleanup.start();
    fix();

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");

    let {url} = await server.listen();

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Server is up and running at " + url);

    if (migrateOnStartup) {
        await migrationDatabase.authenticate();
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Migration Database is up and running");

        await migrationDatabase.sync();
        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Migration Database is set up");

        Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Starting migration...");

        migrate()
            .then(o => Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Migration done! See logfile for eventual errors."))
            .catch((e) => {
                Logger.log("[" + (new Date()).toUTCString() + "] 🚀 Migration failed! See logfile for errors.");
            });
    }

    Logger.log("[" + (new Date()).toUTCString() + "] 🚀 All done, lets go!");
}

start();
