import sequelize from './core/database'
import server from "./core/server";
import fs from "fs";
import {coverDir, wwwDir} from "./config/config";
import {cleanup} from './core/cleanup';
const shell = require('shelljs');

async function start() {
    await sequelize.authenticate();
    console.log('🚀 Database is up and running');

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

    console.log('🚀 Database is set up');

    if (!fs.existsSync(wwwDir + '/' + coverDir))
        shell.mkdir('-p', wwwDir + '/' + coverDir);

    console.log('🚀 Coverdir is set up at ' + wwwDir + '/' + coverDir);

    console.log('🚀 Starting cleanup process');

    cleanup.start();

    console.log('🚀 Cleanup process is running');

    let {url} = await server.listen();

    console.log('🚀 Server is up and running at ' + url);

    console.log('🚀 All done, lets go!');
}

start();