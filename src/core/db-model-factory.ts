import { Sequelize } from 'sequelize';
import { dbPassword, dbUser } from '../config/config';
import { DbModels } from '../types/db';

const DEFAULT_SCHEMA = 'shortbox';

type ModelFactory = (sequelize: Sequelize) => unknown;

type LoadedFactories = {
  PublisherFactory: ModelFactory;
  SeriesFactory: ModelFactory;
  IssueFactory: ModelFactory;
  StoryFactory: ModelFactory;
  CoverFactory: ModelFactory;
  ArcFactory: ModelFactory;
  IndividualFactory: ModelFactory;
  AppearanceFactory: ModelFactory;
  UserFactory: ModelFactory;
  AdminTaskResultFactory: ModelFactory;
  ChangeRequestFactory: ModelFactory;
  Issue_IndividualFactory: ModelFactory;
  Issue_ArcFactory: ModelFactory;
  Story_IndividualFactory: ModelFactory;
  Story_AppearanceFactory: ModelFactory;
  Cover_IndividualFactory: ModelFactory;
};

const modelModulePaths = [
  '../modules/publisher/Publisher.model',
  '../modules/series/Series.model',
  '../modules/issue/Issue.model',
  '../modules/story/Story.model',
  '../modules/cover/Cover.model',
  '../modules/arc/Arc.model',
  '../modules/individual/Individual.model',
  '../modules/appearance/Appearance.model',
  '../modules/user/User.model',
  '../modules/admin-task-result/AdminTaskResult.model',
  '../modules/change-request/ChangeRequest.model',
  '../modules/shared/Issue_Individual.model',
  '../modules/shared/Issue_Arc.model',
  '../modules/shared/Story_Individual.model',
  '../modules/shared/Story_Appearance.model',
  '../modules/shared/Cover_Individual.model',
];

const loadFactories = (): LoadedFactories => {
  for (const modulePath of modelModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }

  return {
    PublisherFactory: require('../modules/publisher/Publisher.model').default,
    SeriesFactory: require('../modules/series/Series.model').default,
    IssueFactory: require('../modules/issue/Issue.model').default,
    StoryFactory: require('../modules/story/Story.model').default,
    CoverFactory: require('../modules/cover/Cover.model').default,
    ArcFactory: require('../modules/arc/Arc.model').default,
    IndividualFactory: require('../modules/individual/Individual.model').default,
    AppearanceFactory: require('../modules/appearance/Appearance.model').default,
    UserFactory: require('../modules/user/User.model').default,
    AdminTaskResultFactory: require('../modules/admin-task-result/AdminTaskResult.model').default,
    ChangeRequestFactory: require('../modules/change-request/ChangeRequest.model').default,
    Issue_IndividualFactory: require('../modules/shared/Issue_Individual.model').default,
    Issue_ArcFactory: require('../modules/shared/Issue_Arc.model').default,
    Story_IndividualFactory: require('../modules/shared/Story_Individual.model').default,
    Story_AppearanceFactory: require('../modules/shared/Story_Appearance.model').default,
    Cover_IndividualFactory: require('../modules/shared/Cover_Individual.model').default,
  };
};

export const createDbModels = (databaseName: string, schema = DEFAULT_SCHEMA): DbModels => {
  const sequelize = new Sequelize(databaseName, dbUser, dbPassword, {
    logging: false,
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    quoteIdentifiers: false,
    define: {
      timestamps: true,
      schema,
      createdAt: 'createdat',
      updatedAt: 'updatedat',
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  const {
    PublisherFactory,
    SeriesFactory,
    IssueFactory,
    StoryFactory,
    CoverFactory,
    ArcFactory,
    IndividualFactory,
    AppearanceFactory,
    UserFactory,
    AdminTaskResultFactory,
    ChangeRequestFactory,
    Issue_IndividualFactory,
    Issue_ArcFactory,
    Story_IndividualFactory,
    Story_AppearanceFactory,
    Cover_IndividualFactory,
  } = loadFactories();

  const db = {
    sequelize,
    Sequelize,
  } as unknown as DbModels;

  db.Publisher = PublisherFactory(sequelize) as DbModels['Publisher'];
  db.Series = SeriesFactory(sequelize) as DbModels['Series'];
  db.Issue = IssueFactory(sequelize) as DbModels['Issue'];
  db.Story = StoryFactory(sequelize) as DbModels['Story'];
  db.Cover = CoverFactory(sequelize) as DbModels['Cover'];
  db.Arc = ArcFactory(sequelize) as DbModels['Arc'];
  db.Individual = IndividualFactory(sequelize) as DbModels['Individual'];
  db.Appearance = AppearanceFactory(sequelize) as DbModels['Appearance'];
  db.User = UserFactory(sequelize) as DbModels['User'];
  db.AdminTaskResult = AdminTaskResultFactory(sequelize) as DbModels['AdminTaskResult'];
  db.ChangeRequest = ChangeRequestFactory(sequelize) as DbModels['ChangeRequest'];
  db.Issue_Individual = Issue_IndividualFactory(sequelize) as DbModels['Issue_Individual'];
  db.Issue_Arc = Issue_ArcFactory(sequelize) as DbModels['Issue_Arc'];
  db.Story_Individual = Story_IndividualFactory(sequelize) as DbModels['Story_Individual'];
  db.Story_Appearance = Story_AppearanceFactory(sequelize) as DbModels['Story_Appearance'];
  db.Cover_Individual = Cover_IndividualFactory(sequelize) as DbModels['Cover_Individual'];

  Object.keys(db).forEach((modelName) => {
    const model = db[modelName as keyof DbModels] as unknown as {
      associate?: (models: DbModels) => void;
    };
    if (model.associate) model.associate(db);
  });

  return db;
};

export const closeDbModels = async (db: DbModels | null | undefined) => {
  if (!db) return;
  await db.sequelize.close();
};
