import fs from 'fs';
import path from 'path';
import Sequelize from 'sequelize';

import migrationDatabase from '../core/database';

const migration = {
    migrationDatabase,
    Sequelize
};

fs
    .readdirSync(__dirname)
    .filter(file =>
        path.extname(file) === '.js' &&
        file !== 'index.js',
    )
    .forEach((file) => {
        const model = migrationDatabase.import(path.join(__dirname, file));
        migration[model.name] = model;
    });

Object.keys(migration).forEach((modelName) => {
    if ('associate' in migration[modelName]) {
        migration[modelName].associate(migration);
    }
});

export default migration;