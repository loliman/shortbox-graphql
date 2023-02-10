import sequelize from './core/database'
import fs from "fs";
import {coverDir, wwwDir} from "./config/config";
import {cleanup} from './core/cleanup';

const shell = require('shelljs');

export async function boot(process) {
    await sequelize.authenticate();
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is up and running");

    await sequelize.sync();

    //remove that nasty constraints...
    try {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Removing constraints from Database...");

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
        console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    try {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Creating stored procedures...");

        let sql = await fs.readFileSync('./functions.sql');
        await sequelize.query(sql.toString());
    } catch (e) {
        //might already exist
    } finally {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is all set up");

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Creating cover directory...");

    if (!fs.existsSync(wwwDir + '/' + coverDir))
        shell.mkdir('-p', wwwDir + '/' + coverDir);

    console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Coverdir is set up at " + wwwDir + "/" + coverDir);

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Starting cleanup process...");

    cleanup.start();

    console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");


    await process();

    console.log("[" + (new Date()).toUTCString() + "] 🚀 All done, lets go!");
}
