import { Model, ModelStatic, Sequelize } from 'sequelize';
import { Publisher } from '../modules/publisher/Publisher.model';
import { Series } from '../modules/series/Series.model';
import { Issue } from '../modules/issue/Issue.model';
import { Story } from '../modules/story/Story.model';
import { Cover } from '../modules/cover/Cover.model';
import { Arc } from '../modules/arc/Arc.model';
import { Individual } from '../modules/individual/Individual.model';
import { Appearance } from '../modules/appearance/Appearance.model';
import { User } from '../modules/user/User.model';
import { AdminTaskResult } from '../modules/admin-task-result/AdminTaskResult.model';
import { ChangeRequest } from '../modules/change-request/ChangeRequest.model';

export interface DbModels {
  Publisher: ModelStatic<Publisher>;
  Series: ModelStatic<Series>;
  Issue: ModelStatic<Issue>;
  Story: ModelStatic<Story>;
  Cover: ModelStatic<Cover>;
  Arc: ModelStatic<Arc>;
  Individual: ModelStatic<Individual>;
  Appearance: ModelStatic<Appearance>;
  User: ModelStatic<User>;
  AdminTaskResult: ModelStatic<AdminTaskResult>;
  ChangeRequest: ModelStatic<ChangeRequest>;
  Issue_Individual: ModelStatic<Model>;
  Issue_Arc: ModelStatic<Model>;
  Story_Individual: ModelStatic<Model>;
  Story_Appearance: ModelStatic<Model>;
  Cover_Individual: ModelStatic<Model>;
  sequelize: Sequelize;
  Sequelize: typeof Sequelize;
}
