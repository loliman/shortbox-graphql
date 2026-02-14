const loadMigrationsModule = (isDefined: boolean) => {
  jest.resetModules();

  const define = jest.fn().mockReturnValue({ modelName: 'DefinedSchemaMigrationModel' });
  const model = jest.fn().mockReturnValue({ modelName: 'ExistingSchemaMigrationModel' });
  const getQueryInterface = jest.fn().mockReturnValue({ queryInterface: 'mocked' });

  const sequelize = {
    isDefined: jest.fn().mockReturnValue(isDefined),
    define,
    model,
    getQueryInterface,
  };

  const defaultResolver = jest.fn().mockImplementation((params) => ({
    name: params.name,
    up: jest.fn(),
    down: jest.fn(),
  }));

  const Umzug = jest.fn().mockImplementation((config) => ({ config }));
  Object.assign(Umzug, {
    defaultResolver,
  });

  const SequelizeStorage = jest.fn().mockImplementation((config) => ({
    storageConfig: config,
  }));

  jest.doMock('../../src/core/database', () => ({
    __esModule: true,
    default: sequelize,
  }));
  jest.doMock('umzug', () => ({
    Umzug,
    SequelizeStorage,
  }));

  const module = require('../../src/core/migrations');

  return { migrator: module.migrator, sequelize, Umzug, SequelizeStorage, defaultResolver };
};

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('migrations core', () => {
  it('reuses an existing storage model when already defined', () => {
    const { sequelize, Umzug, SequelizeStorage, defaultResolver, migrator } = loadMigrationsModule(
      true,
    );

    expect(sequelize.isDefined).toHaveBeenCalledWith('SchemaMigration');
    expect(sequelize.model).toHaveBeenCalledWith('SchemaMigration');
    expect(sequelize.define).not.toHaveBeenCalled();

    expect(SequelizeStorage).toHaveBeenCalledWith({
      model: { modelName: 'ExistingSchemaMigrationModel' },
      columnName: 'id',
    });

    expect(Umzug).toHaveBeenCalledTimes(1);
    const umzugConfig = Umzug.mock.calls[0][0];
    expect(umzugConfig.context).toEqual({ queryInterface: 'mocked' });
    expect(umzugConfig.logger).toBe(console);
    expect(umzugConfig.migrations.glob).toContain('/migrations/*.{ts,js}');

    const resolved = umzugConfig.migrations.resolve({ name: '20260213_test.ts' });
    expect(defaultResolver).toHaveBeenCalledWith({ name: '20260213_test.ts' });
    expect(resolved.name).toBe('20260213_test');
    expect(typeof resolved.up).toBe('function');
    expect(typeof resolved.down).toBe('function');

    expect(migrator.config).toBe(umzugConfig);
  });

  it('creates the storage model when it does not exist yet', () => {
    const { sequelize, SequelizeStorage } = loadMigrationsModule(false);

    expect(sequelize.isDefined).toHaveBeenCalledWith('SchemaMigration');
    expect(sequelize.model).not.toHaveBeenCalled();
    expect(sequelize.define).toHaveBeenCalledTimes(1);

    const [tableName, attributes, options] = sequelize.define.mock.calls[0];
    expect(tableName).toBe('SchemaMigration');
    expect(attributes.id.primaryKey).toBe(true);
    expect(attributes.id.allowNull).toBe(false);
    expect(attributes.appliedAt.allowNull).toBe(false);
    expect(options).toEqual({
      tableName: 'SchemaMigration',
      freezeTableName: true,
      timestamps: false,
    });

    expect(SequelizeStorage).toHaveBeenCalledWith({
      model: { modelName: 'DefinedSchemaMigrationModel' },
      columnName: 'id',
    });
  });
});
