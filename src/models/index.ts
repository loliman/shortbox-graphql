import { Sequelize } from 'sequelize';
import sequelize from '../core/database';

// Import models
import PublisherFactory from '../modules/publisher/Publisher.model';
import SeriesFactory from '../modules/series/Series.model';
import IssueFactory from '../modules/issue/Issue.model';
import StoryFactory from '../modules/story/Story.model';
import CoverFactory from '../modules/cover/Cover.model';
import ArcFactory from '../modules/arc/Arc.model';
import IndividualFactory from '../modules/individual/Individual.model';
import AppearanceFactory from '../modules/appearance/Appearance.model';
import UserFactory from '../modules/user/User.model';
import AdminTaskResultFactory from '../modules/admin-task-result/AdminTaskResult.model';
import ChangeRequestFactory from '../modules/change-request/ChangeRequest.model';

// Import Join Tables
import Issue_IndividualFactory from '../modules/shared/Issue_Individual.model';
import Issue_ArcFactory from '../modules/shared/Issue_Arc.model';
import Story_IndividualFactory from '../modules/shared/Story_Individual.model';
import Story_AppearanceFactory from '../modules/shared/Story_Appearance.model';
import Cover_IndividualFactory from '../modules/shared/Cover_Individual.model';

import { DbModels } from '../types/db';

const db = {
  sequelize,
  Sequelize,
} as unknown as DbModels;

// Initialize models
db.Publisher = PublisherFactory(sequelize);
db.Series = SeriesFactory(sequelize);
db.Issue = IssueFactory(sequelize);
db.Story = StoryFactory(sequelize);
db.Cover = CoverFactory(sequelize);
db.Arc = ArcFactory(sequelize);
db.Individual = IndividualFactory(sequelize);
db.Appearance = AppearanceFactory(sequelize);
db.User = UserFactory(sequelize);
db.AdminTaskResult = AdminTaskResultFactory(sequelize);
db.ChangeRequest = ChangeRequestFactory(sequelize);

db.Issue_Individual = Issue_IndividualFactory(sequelize);
db.Issue_Arc = Issue_ArcFactory(sequelize);
db.Story_Individual = Story_IndividualFactory(sequelize);
db.Story_Appearance = Story_AppearanceFactory(sequelize);
db.Cover_Individual = Cover_IndividualFactory(sequelize);

// Associate models
Object.keys(db).forEach((modelName) => {
  const model = db[modelName as keyof DbModels] as unknown as {
    associate?: (models: DbModels) => void;
  };
  if (model.associate) {
    model.associate(db);
  }
});

export default db;
