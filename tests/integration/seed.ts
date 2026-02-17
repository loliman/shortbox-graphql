import models from '../../src/models';

const TEST_SCHEMA = 'shortbox';

export const resetAndSeedDatabase = async () => {
  await models.sequelize.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
  await models.sequelize.sync({ force: true });

  const publisher = await models.Publisher.create({
    name: 'Marvel Comics',
    original: true,
    addinfo: 'integration-test',
    startyear: 1939,
    endyear: null,
  });

  const series = await models.Series.create({
    title: 'Spider-Man',
    volume: 1,
    startyear: 1963,
    endyear: null,
    addinfo: 'integration-test',
    fk_publisher: publisher.id,
  });

  const issueBasePayload = {
    title: 'Spider-Man',
    number: '1',
    format: 'HEFT',
    releasedate: '1963-03-01',
    pages: 32,
    price: 0.12,
    currency: 'USD',
    verified: true,
    collected: false,
    comicguideid: 'cg-1',
    isbn: '',
    limitation: '',
    addinfo: 'integration-test',
    fk_series: series.id,
  };

  const issue = await models.Issue.create({
    ...issueBasePayload,
    variant: '',
  });

  const issueVariant = await models.Issue.create({
    ...issueBasePayload,
    variant: 'B',
    comicguideid: 'cg-1b',
  });

  await models.Story.bulkCreate([
    {
      title: 'Story 1',
      number: 1,
      onlyapp: false,
      firstapp: false,
      otheronlytb: false,
      onlytb: false,
      onlyoneprint: false,
      collected: false,
      collectedmultipletimes: false,
      addinfo: '',
      part: '',
      fk_issue: issue.id,
      fk_parent: null,
      fk_reprint: null,
    },
    {
      title: 'Story 2',
      number: 1,
      onlyapp: false,
      firstapp: false,
      otheronlytb: false,
      onlytb: false,
      onlyoneprint: false,
      collected: false,
      collectedmultipletimes: false,
      addinfo: '',
      part: '',
      fk_issue: issueVariant.id,
      fk_parent: null,
      fk_reprint: null,
    },
  ]);

  await models.Cover.bulkCreate([
    {
      url: 'https://example.test/cover-main.jpg',
      number: 0,
      addinfo: '',
      fk_issue: issue.id,
      fk_parent: null,
    },
    {
      url: 'https://example.test/cover-variant.jpg',
      number: 0,
      addinfo: '',
      fk_issue: issueVariant.id,
      fk_parent: null,
    },
  ]);
};

export const closeDatabase = async () => {
  try {
    await models.sequelize.close();
  } catch {
    // ignore close races during failed startup/shutdown
  }
};
