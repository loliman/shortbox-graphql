import {knexMigration} from './database';
import {OldIssue} from '../database/OldIssue';
import {Issue} from '../../database/Issue';
import {OldSeries} from '../database/OldSeries';
import {asyncForEach} from '../../util/util';
import {OldPublisher} from '../database/OldPublisher';
import {OldStory} from '../database/OldStory';
import {MarvelFandomCrawler} from '../../core/crawler/MarvelFandomCrawler';
import {knex} from '../../core/database';
import {Transaction} from 'objection';
import {Individual} from '../../database/Individual';
import {Appearance} from '../../database/Appearance';
import {Arc} from '../../database/Arc';
import {Publisher} from '../../database/Publisher';
import {Series} from '../../database/Series';
import {Story} from '../../database/Story';
import * as fs from 'fs';
import {WriteStream} from 'fs';

let log: WriteStream;
let migrationLog: WriteStream;
let crawlerLog: WriteStream;

function initLogs() {
  log = fs.createWriteStream('logs/error.log', {flags: 'a'});
  migrationLog = fs.createWriteStream('logs/migration.log', {flags: 'a'});
  crawlerLog = fs.createWriteStream('logs/crawler.log', {flags: 'a'});
}

function closeLogs() {
  if (log) log.end();
  if (crawlerLog) crawlerLog.end();
  if (migrationLog) migrationLog.end();
}

function logError(issue: OldIssue, e: Error) {
  let message: string =
    issue.series.title +
    ' Vol. ' +
    issue.series.volume +
    ' #' +
    issue.number +
    ' (' +
    issue.series.publisher.name +
    '): ' +
    e;

  console.log(message);

  if (e.message.indexOf('[CRAWLER]') > -1) {
    crawlerLog.write(message + '\n');
  } else if (e.message.indexOf('[MIGRATION]') > -1) {
    migrationLog.write(message + '\n');
  } else {
    log.write(message + '\n');
  }
}

function toTitleCase(str: string): string {
  let splitStr = str.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i++) {
    splitStr[i] =
      splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  return splitStr.join(' ');
}

function titleOf(s: any): string {
  return s.title
    ? toTitleCase(s.title.replace(/[^a-zA-Z0-9 ]/g, '')).trim()
    : s.title;
}

async function migrateMismatchingStoryCount(issue: any, stories: any[]) {
  let message;
  let foundAll = true;

  if (issue.stories.length > stories.length) {
    stories.forEach((s: any) => {
      if (
        issue.stories.filter((s2: any) => titleOf(s2) === titleOf(s)).length ===
          0 &&
        foundAll
      ) {
        foundAll = false;
      }
    });

    message =
      '[MIGRATION] ' +
      generateIssueName(issue) +
      '\nAnzahl der Stories nicht identisch (crawled = ' +
      issue.stories.length +
      ' > oldDb = ' +
      stories.length +
      ')';
  } else {
    issue.stories.forEach((s: any) => {
      if (
        stories.filter((s2: any) => titleOf(s2) === titleOf(s)).length === 0 &&
        foundAll
      ) {
        foundAll = false;
      }
    });

    message =
      '[MIGRATION] ' +
      generateIssueName(issue) +
      '\nAnzahl der Stories nicht identisch (crawled = ' +
      issue.stories.length +
      ' < oldDb = ' +
      stories.length +
      ')';
  }

  throw new Error(
    message +
      ('\n' +
        (foundAll
          ? 'Stories passen zusammen'
          : 'Stories passen NICHT zusammen') +
        (await prepareStoriesForVisualization(issue, stories)) +
        '\n')
  );
}

async function prepareStoriesForVisualization(a: any, b: any[]) {
  let issues: any = await OldIssue.query(knexMigration)
    .leftJoinRelated('[series.publisher]')
    .where('original', 1)
    .where('series.title', a.series.title)
    .where('series.volume', a.series.volume)
    .where('issue.number', a.number)
    .withGraphFetched(
      'stories.[children.[issue.[stories, series.[publisher]]]]'
    )
    .withGraphFetched('series.[publisher]');

  let stories: OldIssue[] = issues.size > 0 ? issues[0].stories : [];

  let merged: any[] = [];
  merged = merged.concat(a.stories);
  merged = merged.concat(b);
  merged = merged.sort((a: any, b: any) => a.number - b.number);
  merged = mapStories(merged);
  merged = merged.filter((item, pos) => merged.indexOf(item) == pos);

  let copyOfA: any[] = mapStories(JSON.parse(JSON.stringify(a.stories)));
  let copyOfB: any[] = mapStories(JSON.parse(JSON.stringify(b)));

  let newA: any[] = [];
  let newB: any[] = [];

  let counted = false;
  merged.forEach((m: any, i: number) => {
    counted = false;
    stories.forEach((s: any) => {
      if (titleOf(s) === m) {
        let title = m;
        if (title === '') {
          title = 'Untitled';
        }

        merged[i] = title + ' [' + s.children.length + 'x]';
        counted = true;
      }
    });

    if (!counted) {
      merged[i] = m + ' [0x]';
    }
  });

  merged.forEach((m: any) => {
    if (copyOfA.filter((s: any) => m.indexOf(s) > -1).length > 0) {
      newA.push(m);
    } else {
      let spacer = Array(m.length + 1).join(' ');
      newA.push(spacer);
    }
  });

  merged.forEach((m: any) => {
    if (copyOfB.filter((s: any) => m.indexOf(s) > -1).length > 0) {
      newB.push(m);
    } else {
      let spacer = Array(m.length + 1).join(' ');
      newB.push(spacer);
    }
  });

  return (
    '\n\tcrawled: ' +
    JSON.stringify(newA) +
    '\n\toldDb  : ' +
    JSON.stringify(newB)
  );
}

function mapStories(array: any[]) {
  return array.map((s: any) =>
    s.title ? titleOf(s) : s.reprintOf ? titleOf(s.reprintOf) + ' [R]' : ''
  );
}

function prepareIssueBeforeInsertion(issue: OldIssue) {
  issue.createdAt = undefined;
  issue.updatedAt = undefined;
  issue.fk_series = undefined;
  issue.series.createdAt = undefined;
  issue.series.updatedAt = undefined;
  issue.series.fk_publisher = undefined;
  issue.series.publisher.createdAt = undefined;
  issue.series.publisher.updatedAt = undefined;
}

async function migrateIssue(
  issue: OldIssue,
  i: number,
  array: any[],
  imported: boolean
) {
  const trx: Transaction = await Issue.startTransaction(knex);

  try {
    let exists = await Issue.query(trx)
      .leftJoinRelated('[series.publisher]')
      .where('number', issue.number)
      .where('format', issue.format)
      .where('variant', issue.variant + '')
      .where('us', issue.series.publisher.original)
      .where('name', issue.series.publisher.name)
      .where('series.title', issue.series.title)
      .where('volume', issue.series.volume)
      .first();

    if (exists) {
      await trx.commit();
      return;
    }

    let series: OldSeries = issue.series;
    let publisher: OldPublisher = series.publisher;
    let storiesDe: OldStory[] = issue.stories;

    console.log(
      '\n[%i/%i] %s Vol. %i #%s (%s) %s',
      i + 1,
      array.length,
      series.title,
      series.volume,
      issue.number,
      publisher.name,
      issue.variant
    );

    await asyncForEach(
      storiesDe,
      async (storyDe: OldStory, i: number, array: any[]) => {
        if (!storyDe.parent) {
          storyDe.id = undefined;
          storyDe.title = ' ';
          storyDe.addinfo = ' ';
          return;
        }

        let storyUs: OldStory = storyDe.parent;
        let issueUs: OldIssue = storyUs.issue;
        let seriesUs: OldSeries = issueUs.series;
        let publisherUs: OldPublisher = seriesUs.publisher;
        let storiesUs: OldStory[] = issueUs.stories;

        console.log(
          '\t[STORY] [%i/%i] %s Vol. %i #%s (%s) %i',
          i + 1,
          array.length,
          seriesUs.title,
          seriesUs.volume,
          issueUs.number,
          publisherUs.name,
          storyUs.number
        );

        let exists = await Issue.query(trx)
          .leftJoinRelated('[series.publisher]')
          .where('number', issueUs.number)
          .where('variant', '')
          .where('us', 1)
          .where('series.title', seriesUs.title)
          .where('volume', seriesUs.volume)
          .withGraphFetched('stories')
          .withGraphFetched('series')
          .first();

        if (!exists) {
          let issueCrawled: void | any;

          try {
            issueCrawled = await new MarvelFandomCrawler()
              .crawl(issueUs.number, seriesUs.title, seriesUs.volume)
              .catch(e => {
                throw e;
              });
          } catch (e) {
            if (
              e.message.indexOf('[CRAWLER]') > -1 &&
              e.message.indexOf('- Not found') > -1
            ) {
              issueCrawled = new Issue();
              issueCrawled.title = issueUs.title;
              issueCrawled.number = issueUs.number;
              issueCrawled.pages = issueUs.pages;
              issueCrawled.price = issueUs.price;
              issueCrawled.currency = issueUs.currency;
              issueCrawled.format = issueUs.format;
              issueCrawled.variant = issueUs.variant;
              issueCrawled.releasedate = issueUs.releasedate;
              issueCrawled.addinfo = issueUs.addinfo;
              issueCrawled.series = new Series();
              issueCrawled.series.volume = issueUs.series.volume;
              issueCrawled.series.title = issueUs.series.title;
              issueCrawled.series.publisher = new Publisher();
              issueCrawled.series.publisher.name =
                issueUs.series.publisher.name;
              issueCrawled.series.publisher.original = 1;
              issueCrawled.stories = [];
              issueUs.stories.forEach(story => {
                let newStory: Story = new Story();
                newStory.number = story.number;
                newStory.title = story.title;
                newStory.appearances = [];
                if (story.appearances) {
                  story.appearances.forEach(app => {
                    let newApp: Appearance = new Appearance();
                    newApp.name = app.name;
                    newApp.type = app.type;
                    newApp.role = app.role;
                    newStory.appearances.push(newApp);
                  });
                }
                newStory.individuals = [];
                if (story.individuals) {
                  story.individuals.forEach(individual => {
                    let newIndividual: Individual = new Individual();
                    newIndividual.name = individual.name;
                    newIndividual.type = individual.type;
                    newStory.individuals.push(newIndividual);
                  });
                }
                issueCrawled.edited = 1;
                issueCrawled.stories.push(newStory);
              });
            } else {
              throw e;
            }
          }

          if (imported || issueCrawled?.stories.length == storiesUs.length) {
            await handleIssue(issueCrawled, trx);

            exists = await Issue.query(trx)
              .leftJoinRelated('[series.publisher]')
              .where('number', issueCrawled.number)
              .where('variant', '')
              .where('us', 1)
              .where('series.title', issueCrawled.series.title)
              .where('volume', issueCrawled.series.volume)
              .withGraphFetched('stories')
              .first();
          } else {
            await migrateMismatchingStoryCount(issueCrawled, storiesUs);
          }
        }

        if (exists || imported) {
          if (imported || exists.stories.length == storiesUs.length) {
            issue.stories[i] = setStoriesInOldIssue(storyDe, exists);
          } else {
            await migrateMismatchingStoryCount(exists, storiesUs);
          }
        }
      }
    );

    prepareIssueBeforeInsertion(issue);
    await handleIssue(issue, trx);

    await trx.commit();
  } catch (e) {
    logError(issue, e);
    await trx.rollback();
  }
}

export async function migrate() {
  initLogs();

  let issues: OldIssue[] = await OldIssue.query(knexMigration)
    .leftJoinRelated('[series.publisher]')
    .where('original', 0)
    .where('series.title', 'Die Spinne Comic-Album')
    .where('series.volume', 1)
    .where('number', '32')
    .withGraphFetched('stories.[parent.[issue.[stories, series.[publisher]]]]')
    .withGraphFetched('series.[publisher]');

  await asyncForEach(
    issues,
    async (issue: OldIssue, i: number, array: any[]) => {
      await migrateIssue(issue, i, array, false);
    }
  );

  try {
    const path = './import.csv';

    if (fs.existsSync(path)) {
      let allFileContents = fs.readFileSync(path, 'utf-8');
      let issuesFromFile: OldIssue[] = [];

      allFileContents.split(/\r?\n/).forEach(line => {
        let issue = JSON.parse(line);
        issue.releasedate = new Date(issue.releasedate);
        issuesFromFile.push(issue);
      });

      await asyncForEach(
        issuesFromFile,
        async (issue: OldIssue, i: number, array: any[]) => {
          await migrateIssue(issue, i, array, true);
        }
      );
    }
  } catch (err) {
    console.error(err);
  }

  closeLogs();
}

function setStoriesInOldIssue(oldStory: any, usIssue: any) {
  let story: any = {};
  story['number'] = oldStory.number;
  story['parent'] = {};
  story['parent']['#dbRef'] = usIssue.stories[oldStory.parent.number - 1].id;

  return story;
}

const dbFnIndividuals = async (o: Individual, trx: Transaction) => {
  let individual: Individual = await Individual.query(trx)
    .where('name', o.name)
    .first();
  return individual ? individual.id : individual;
};

const dbFnAppearance = async (o: Appearance, trx: Transaction) => {
  let app: Appearance = await Appearance.query(trx)
    .where('name', o.name)
    .where('type', o.type)
    .first();
  return app ? app.id : app;
};

const dbFnArcs = async (o: Arc, trx: Transaction) => {
  let arc: Arc = await Arc.query(trx)
    .where('title', o.title)
    .where('type', o.type)
    .first();
  return arc ? arc.id : arc;
};

async function markIssue(issue: any, trx: Transaction) {
  issue.series.id = undefined;
  if (issue.series.publisher) {
    issue.series.publisher.id = undefined;
    if (issue.series.publisher.original != undefined) {
      issue.series.publisher.us = issue.series.publisher.original;
      issue.series.publisher.original = undefined;
    }
  }

  let publisher: Publisher = await Publisher.query(trx)
    .where('name', issue.series.publisher.name)
    .where('us', issue.series.publisher.us)
    .first();

  if (publisher) {
    issue.series.publisher = {};
    issue.series.publisher['#dbRef'] = publisher.id;

    let s: Series = await Series.query(trx)
      .where('title', issue.series.title)
      .where('volume', issue.series.volume)
      .where('fk_publisher', publisher.id)
      .first();

    if (s) {
      issue.series = {};
      issue.series['#dbRef'] = s.id;

      let i: Issue = await Issue.query(trx)
        .where('number', issue.number)
        .where('fk_series', s.id)
        .where('variant', issue.variant ? issue.variant : '')
        .first();

      if (i) {
        issue = {};
        issue['#dbRef'] = i.id;
      }
    }
  }

  return issue;
}

async function markDuplicatesForIssue(issue: any, trx: Transaction) {
  let individuals: Map<string, string> = new Map();
  let apps: Map<string, string> = new Map();
  let arcs: Map<string, string> = new Map();

  issue = await markIssue(JSON.parse(JSON.stringify(issue)), trx);

  if (issue['#dbRef']) {
    return issue;
  }

  await markDuplicates(
    individuals,
    issue.individuals,
    (o: Individual) => o.name,
    dbFnIndividuals,
    trx
  );

  await markDuplicates(
    arcs,
    issue.arcs,
    (o: Arc) => o.title + ' ' + o.type,
    dbFnArcs,
    trx
  );

  if (issue.cover) {
    await markDuplicates(
      individuals,
      issue.cover.individuals,
      (o: Individual) => o.name,
      dbFnIndividuals,
      trx
    );
  }

  await asyncForEach(issue.stories, async (story: any) => {
    await markDuplicates(
      individuals,
      story.individuals,
      (o: Individual) => o.name,
      dbFnIndividuals,
      trx
    );

    await markDuplicates(
      apps,
      story.appearances,
      (o: Appearance) => o.name + ' ' + o.type,
      dbFnAppearance,
      trx
    );
  });

  return issue;
}

async function markDuplicates(
  ids: Map<string, string>,
  array: any[],
  keyFn: any,
  dbFn: any,
  trx: Transaction
) {
  await asyncForEach(array, async (o: any, i: number) => {
    let idFromDb: number = await dbFn(o, trx);
    if (idFromDb) {
      let type = array[i].type;
      let role = array[i].role;
      array[i] = {};
      array[i]['type'] = type;
      array[i]['role'] = role;
      array[i]['#dbRef'] = idFromDb;
    } else {
      let key = keyFn(o);

      if (!ids.has(key)) {
        let id = key.replaceAll(' ', '').toLowerCase();
        ids.set(key, id);
        o['#id'] = id;
      } else {
        let id = ids.get(key);
        let type = array[i].type;
        let role = array[i].role;
        array[i] = {};
        array[i]['type'] = type;
        array[i]['role'] = role;
        array[i]['#ref'] = id;
      }
    }
  });
}

function generateIssueName(issue: any) {
  return generateSeriesName(issue.series) + ' ' + issue.number.trim();
}

function generateSeriesName(series: any) {
  return series.title.trim() + ' Vol ' + series.volume;
}

async function handleIssue(issue: any, trx: Transaction) {
  console.log(
    '\t\t[ISSUE] %s Vol. %i #%s (%s)',
    issue.series.title,
    issue.series.volume,
    issue.number,
    issue.series.publisher ? issue.series.publisher.name : '???'
  );

  if (issue.id !== undefined) {
    issue.id = undefined;
  }

  await asyncForEach(issue.stories, async (s: any) => {
    if (s.reprintOf) {
      let query = Story.query(trx)
        .leftJoinRelated('[issue.series.publisher]')
        .where('story.number', s.reprintOf.number)
        .where('issue.number', s.reprintOf.issue.number)
        .where('issue.variant', '')
        .where('issue:series:publisher.us', 1)
        .where('issue:series.title', s.reprintOf.issue.series.title)
        .where('issue:series.volume', s.reprintOf.issue.series.volume);

      await handleIssue(s.reprintOf.issue, trx);

      let originalStory = await query.first();

      s.reprintOf = {};
      s.reprintOf['#dbRef'] = originalStory.id;
    }
  });

  let variants: Issue[] = issue.variants ? issue.variants : [];

  issue.variants = undefined;
  issue = await markDuplicatesForIssue(issue, trx);

  if (issue['#dbRef']) return;

  issue.releasedate = issue.releasedate.replace('T', ' ').replace('Z', '');

  await Issue.query(trx).insertGraph(issue, {
    allowRefs: true,
    relate: true,
  });

  await asyncForEach(variants, async (v: Issue, n: number, a: any[]) => {
    console.log('\t\t\t[VARIANT] [%i/%i] %s', n + 1, a.length, v.variant);

    v.variants = undefined;
    v = await markIssue(v, trx);

    v.releasedate = v.releasedate.replace('T', ' ').replace('Z', '');

    await Issue.query(trx).insertGraph(v, {
      allowRefs: true,
      relate: true,
    });
  });
}
