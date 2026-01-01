"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = __importDefault(require("sequelize"));
const database_1 = __importDefault(require("../database"));
const db = {
    sequelize: database_1.default,
    Sequelize: sequelize_1.default,
};
fs_1.default.readdirSync(__dirname)
    .filter((file) => path_1.default.extname(file) === '.js' && file !== 'index.js')
    .forEach((file) => {
    const model = database_1.default.import(path_1.default.join(__dirname, file));
    db[model.name] = model;
});
Object.keys(db).forEach((modelName) => {
    if ('associate' in db[modelName]) {
        db[modelName].associate(db);
    }
});
exports.default = db;
