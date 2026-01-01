"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../core/database"));
// Import models
const Publisher_model_1 = __importDefault(require("../modules/publisher/Publisher.model"));
const Series_model_1 = __importDefault(require("../modules/series/Series.model"));
const Issue_model_1 = __importDefault(require("../modules/issue/Issue.model"));
const Story_model_1 = __importDefault(require("../modules/story/Story.model"));
const Cover_model_1 = __importDefault(require("../modules/cover/Cover.model"));
const Arc_model_1 = __importDefault(require("../modules/arc/Arc.model"));
const Individual_model_1 = __importDefault(require("../modules/individual/Individual.model"));
const Appearance_model_1 = __importDefault(require("../modules/appearance/Appearance.model"));
const User_model_1 = __importDefault(require("../modules/user/User.model"));
const Feature_model_1 = __importDefault(require("../modules/feature/Feature.model"));
// Import Join Tables
const Issue_Individual_model_1 = __importDefault(require("../modules/shared/Issue_Individual.model"));
const Issue_Arc_model_1 = __importDefault(require("../modules/shared/Issue_Arc.model"));
const Story_Individual_model_1 = __importDefault(require("../modules/shared/Story_Individual.model"));
const Story_Appearance_model_1 = __importDefault(require("../modules/shared/Story_Appearance.model"));
const Cover_Individual_model_1 = __importDefault(require("../modules/shared/Cover_Individual.model"));
const Feature_Individual_model_1 = __importDefault(require("../modules/shared/Feature_Individual.model"));
const db = {
    sequelize: database_1.default,
    Sequelize: sequelize_1.Sequelize,
};
// Initialize models
db.Publisher = (0, Publisher_model_1.default)(database_1.default);
db.Series = (0, Series_model_1.default)(database_1.default);
db.Issue = (0, Issue_model_1.default)(database_1.default);
db.Story = (0, Story_model_1.default)(database_1.default);
db.Cover = (0, Cover_model_1.default)(database_1.default);
db.Arc = (0, Arc_model_1.default)(database_1.default);
db.Individual = (0, Individual_model_1.default)(database_1.default);
db.Appearance = (0, Appearance_model_1.default)(database_1.default);
db.User = (0, User_model_1.default)(database_1.default);
db.Feature = (0, Feature_model_1.default)(database_1.default);
db.Issue_Individual = (0, Issue_Individual_model_1.default)(database_1.default);
db.Issue_Arc = (0, Issue_Arc_model_1.default)(database_1.default);
db.Story_Individual = (0, Story_Individual_model_1.default)(database_1.default);
db.Story_Appearance = (0, Story_Appearance_model_1.default)(database_1.default);
db.Cover_Individual = (0, Cover_Individual_model_1.default)(database_1.default);
db.Feature_Individual = (0, Feature_Individual_model_1.default)(database_1.default);
// Associate models
Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});
exports.default = db;
