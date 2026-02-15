const ENV_SNAPSHOT = { ...process.env };

const loadDatabaseModule = (overrides: { dbHost?: string; dbPort?: string } = {}) => {
  process.env = { ...ENV_SNAPSHOT };

  if (typeof overrides.dbHost === 'string') process.env.DB_HOST = overrides.dbHost;
  else delete process.env.DB_HOST;

  if (typeof overrides.dbPort === 'string') process.env.DB_PORT = overrides.dbPort;
  else delete process.env.DB_PORT;

  jest.resetModules();

  const Sequelize = jest.fn().mockImplementation(function (...args: any[]) {
    return {
      __args: args,
      options: args[3],
    };
  });

  jest.doMock('sequelize', () => ({
    Sequelize,
  }));
  jest.doMock('../../src/config/config', () => ({
    db: 'shortbox_test',
    dbUser: 'tester',
    dbPassword: 'secret',
  }));

  const module = require('../../src/core/database');

  return { sequelize: module.default, Sequelize };
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('database core', () => {
  it('builds sequelize with secure defaults', () => {
    const { sequelize, Sequelize } = loadDatabaseModule();

    expect(Sequelize).toHaveBeenCalledTimes(1);
    expect(Sequelize).toHaveBeenCalledWith(
      'shortbox_test',
      'tester',
      'secret',
      expect.objectContaining({
        logging: false,
        host: 'localhost',
        dialect: 'mysql',
        port: 3306,
      }),
    );

    expect(sequelize.options.define).toEqual({
      charset: 'utf8',
      collate: 'utf8_general_ci',
      timestamps: true,
    });
    expect(sequelize.options.pool).toEqual({
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    });
  });

  it('respects DB_HOST and DB_PORT overrides', () => {
    const { Sequelize } = loadDatabaseModule({
      dbHost: 'mysql.internal',
      dbPort: '3307',
    });

    const config = Sequelize.mock.calls[0][3];
    expect(config.host).toBe('mysql.internal');
    expect(config.port).toBe(3307);
  });
});
