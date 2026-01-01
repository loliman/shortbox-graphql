"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.boot = boot;
const database_1 = __importDefault(require("./core/database"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config/config");
const cleanup_1 = require("./core/cleanup");
const shelljs_1 = __importDefault(require("shelljs"));
const logger_1 = __importDefault(require("./util/logger"));
async function boot(process) {
    await database_1.default.authenticate();
    logger_1.default.info('🚀 Database is up and running');
    // await sequelize.sync({alter: true});
    //remove that nasty constraints...
    try {
        logger_1.default.info('🚀 Removing constraints from Database...');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('story_individual', 'story_individual_fk_story_fk_individual_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('story_appearance', 'story_appearance_fk_story_fk_appearance_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('Cover_Individual', 'Cover_Individual_fk_individual_fk_cover_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('Feature_Individual', 'Feature_Individual_fk_individual_fk_feature_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('Issue_Individual', 'Issue_Individual_fk_issue_fk_individual_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('Story_Individual', 'Story_Individual_fk_story_fk_individual_unique');
        await database_1.default
            .getQueryInterface()
            .removeConstraint('Story_Appearance', 'Story_Appearance_fk_story_fk_appearance_unique');
    }
    catch (e) {
        //might be gone already, that's fine!
    }
    finally {
        logger_1.default.info('🚀 ... Done!');
    }
    try {
        logger_1.default.info('🚀 Creating stored procedures...');
        let sql = fs_1.default.readFileSync('./functions.sql');
        await database_1.default.query(sql.toString());
    }
    catch (e) {
        //might already exist
    }
    finally {
        logger_1.default.info('🚀 ... Done!');
    }
    logger_1.default.info('🚀 Database is all set up');
    logger_1.default.info('🚀 Creating cover directory...');
    if (!fs_1.default.existsSync(config_1.wwwDir + '/' + config_1.coverDir))
        shelljs_1.default.mkdir('-p', config_1.wwwDir + '/' + config_1.coverDir);
    logger_1.default.info('🚀 ... Done!');
    logger_1.default.info(`🚀 Coverdir is set up at ${config_1.wwwDir}/${config_1.coverDir}`);
    logger_1.default.info('🚀 Starting cleanup process...');
    cleanup_1.cleanup.start();
    logger_1.default.info('🚀 ... Done!');
    await process();
    logger_1.default.info('🚀 All done, lets go!');
}
