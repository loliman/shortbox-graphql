import sequelize from './core/database';
import models from './models';
import fs from 'fs';
import { coverDir, wwwDir } from './config/config';
import { cleanup } from './core/cleanup';
import shell from 'shelljs';
import logger from './util/logger';

export async function boot(process: () => Promise<void>) {
  await sequelize.authenticate();
  logger.info('🚀 Database is up and running');

  await models.UserSession.sync();
  logger.info('🚀 Session table is ready');

  // await sequelize.sync({alter: true});

  //remove that nasty constraints...
  try {
    logger.info('🚀 Removing constraints from Database...');

    await sequelize
      .getQueryInterface()
      .removeConstraint('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('story_individual', 'story_individual_fk_story_fk_individual_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('story_appearance', 'story_appearance_fk_story_fk_appearance_unique');

    await sequelize
      .getQueryInterface()
      .removeConstraint('Cover_Individual', 'Cover_Individual_fk_individual_fk_cover_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('Feature_Individual', 'Feature_Individual_fk_individual_fk_feature_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('Issue_Individual', 'Issue_Individual_fk_issue_fk_individual_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('Story_Individual', 'Story_Individual_fk_story_fk_individual_unique');
    await sequelize
      .getQueryInterface()
      .removeConstraint('Story_Appearance', 'Story_Appearance_fk_story_fk_appearance_unique');
  } catch (e) {
    //might be gone already, that's fine!
  } finally {
    logger.info('🚀 ... Done!');
  }

  try {
    logger.info('🚀 Creating stored procedures...');

    let sql = fs.readFileSync('./functions.sql');
    await sequelize.query(sql.toString());
  } catch (e) {
    //might already exist
  } finally {
    logger.info('🚀 ... Done!');
  }

  logger.info('🚀 Database is all set up');

  logger.info('🚀 Creating cover directory...');

  if (!fs.existsSync(wwwDir + '/' + coverDir)) shell.mkdir('-p', wwwDir + '/' + coverDir);

  logger.info('🚀 ... Done!');

  logger.info(`🚀 Coverdir is set up at ${wwwDir}/${coverDir}`);

  logger.info('🚀 Starting cleanup process...');

  cleanup.start();

  logger.info('🚀 ... Done!');

  await process();

  logger.info('🚀 All done, lets go!');
}
