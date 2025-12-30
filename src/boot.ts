import sequelize from './core/database';
import fs from 'fs';
import { coverDir, wwwDir } from './config/config';
import { cleanup } from './core/cleanup';
import shell from 'shelljs';

export async function boot(process: () => Promise<void>) {
  await sequelize.authenticate();
  console.log('[' + new Date().toUTCString() + '] 🚀 Database is up and running');

  // await sequelize.sync({alter: true});

  //remove that nasty constraints...
  try {
    console.log('[' + new Date().toUTCString() + '] 🚀 Removing constraints from Database...');

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
    console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');
  }

  try {
    console.log('[' + new Date().toUTCString() + '] 🚀 Creating stored procedures...');

    let sql = fs.readFileSync('./functions.sql');
    await sequelize.query(sql.toString());
  } catch (e) {
    //might already exist
  } finally {
    console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');
  }

  console.log('[' + new Date().toUTCString() + '] 🚀 Database is all set up');

  console.log('[' + new Date().toUTCString() + '] 🚀 Creating cover directory...');

  if (!fs.existsSync(wwwDir + '/' + coverDir)) shell.mkdir('-p', wwwDir + '/' + coverDir);

  console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');

  console.log(
    '[' + new Date().toUTCString() + '] 🚀 Coverdir is set up at ' + wwwDir + '/' + coverDir,
  );

  console.log('[' + new Date().toUTCString() + '] 🚀 Starting cleanup process...');

  cleanup.start();

  console.log('[' + new Date().toUTCString() + '] 🚀 ... Done!');

  await process();

  console.log('[' + new Date().toUTCString() + '] 🚀 All done, lets go!');
}
