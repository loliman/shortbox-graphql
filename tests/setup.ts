import sequelize from '../src/core/database';

jest.setTimeout(60000);

beforeAll(async () => {
  // Wir könnten hier die Datenbank synchronisieren, aber wir nutzen die existierende Sandbox-DB
  // await sequelize.authenticate();
});

afterAll(async () => {
  // skip close due to timeout issues in sandbox
}, 30000);
