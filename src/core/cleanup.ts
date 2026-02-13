import models from '../models';
import { asyncForEach } from '../util/util';
import { CronJob } from 'cron';
import { Op } from 'sequelize';
import logger from '../util/logger';

const parsedSessionRetentionDays = parseInt(process.env.SESSION_RETENTION_DAYS || '30', 10);
const SESSION_RETENTION_DAYS =
  Number.isFinite(parsedSessionRetentionDays) && parsedSessionRetentionDays >= 0
    ? parsedSessionRetentionDays
    : 30;
const parsedLoginAttemptRetentionDays = parseInt(
  process.env.LOGIN_ATTEMPT_RETENTION_DAYS || String(SESSION_RETENTION_DAYS),
  10,
);
const LOGIN_ATTEMPT_RETENTION_DAYS =
  Number.isFinite(parsedLoginAttemptRetentionDays) && parsedLoginAttemptRetentionDays >= 0
    ? parsedLoginAttemptRetentionDays
    : SESSION_RETENTION_DAYS;

//Job will on every full hour
export const cleanup = new CronJob(
  '0 3 * * *',
  () => {
    run();
  },
  null,
  false,
);

export async function run() {
  const transaction = await models.sequelize.transaction();

  logger.info('Starting cleanup...');
  try {
    const issues = await models.Issue.findAll({
      where: {
        '$Series->Publisher.original$': 1,
      },
      group: ['fk_series', 'number'],
      include: [
        {
          model: models.Series,
          include: [models.Publisher],
        },
      ],
      transaction,
    });

    //Remove all stories and covers with no children
    let storyCount = 0;
    let coverCount = 0;
    await asyncForEach(issues, async (issue) => {
      const variants = await models.Issue.findAll({
        where: {
          number: issue.number,
          fk_series: issue.fk_series,
        },
        include: [
          {
            model: models.Series,
            include: [models.Publisher],
          },
        ],
        transaction,
      });

      let del = true;
      await asyncForEach(variants, async (variant) => {
        const covers = await models.Cover.findAll({
          where: { fk_issue: variant.id },
          transaction,
        });

        await asyncForEach(covers, async (cover) => {
          if (del) {
            let c = await models.Cover.count({
              where: { fk_parent: cover.id },
              transaction,
            });
            del = c === 0;
          }
        });

        if (del) {
          const stories = await models.Story.findAll({
            where: { fk_issue: variant.id },
            transaction,
          });

          await asyncForEach(stories, async (story) => {
            if (del) {
              let c = await models.Story.count({
                where: { fk_parent: story.id },
                transaction,
              });
              del = c === 0;
            }
          });
        }
      });

      if (del)
        await asyncForEach(variants, async (variant) => {
          const covers = await models.Cover.findAll({
            where: { fk_issue: variant.id },
            transaction,
          });
          await asyncForEach(covers, async (cover) => {
            await cover.destroy({ transaction });
            coverCount++;
          });

          const stories = await models.Story.findAll({
            where: { fk_issue: variant.id },
            transaction,
          });
          await asyncForEach(stories, async (story) => {
            await story.destroy({ transaction });
            storyCount++;
          });
        });
    });
    logger.info(`Deleted ${coverCount} covers.`);
    logger.info(`Deleted ${storyCount} stories.`);

    //Remove all US Issues without content
    let issueCount = 0;
    await asyncForEach(issues, async (issue) => {
      const variants = await models.Issue.findAll({
        where: {
          number: issue.number,
          fk_series: issue.fk_series,
        },
        include: [
          {
            model: models.Series,
            include: [models.Publisher],
          },
        ],
        transaction,
      });

      //only delete if variants are also empty
      let del = true;
      await asyncForEach(variants, async (variant) => {
        if (del) {
          let c = await models.Cover.count({
            where: { fk_issue: variant.id },
            transaction,
          });
          del = c === 0;
        }

        if (del) {
          let c = await models.Story.count({
            where: { fk_issue: variant.id },
            transaction,
          });
          del = c === 0;
        }
      });

      if (del)
        await asyncForEach(variants, async (variant) => {
          await variant.destroy({ transaction });
          issueCount++;
        });
    });
    logger.info(`Deleted ${issueCount} issues.`);

    //Remove all US Series without issues
    const series = await models.Series.findAll({
      where: {
        '$Publisher.original$': 1,
      },
      include: [models.Publisher],
      transaction,
    });

    let seriesCount = 0;
    await asyncForEach(series, async (seriesItem) => {
      let c = await models.Issue.count({
        where: { fk_series: seriesItem.id },
        transaction,
      });
      let del = c === 0;

      if (del) {
        await seriesItem.destroy({ transaction });
        seriesCount++;
      }
    });
    logger.info(`Deleted ${seriesCount} series.`);

    //Remove all US publishers without series
    const publishers = await models.Publisher.findAll({
      where: {
        original: 1,
      },
      transaction,
    });

    let publisherCount = 0;
    await asyncForEach(publishers, async (publisher) => {
      let c = await models.Series.count({
        where: { fk_publisher: publisher.id },
        transaction,
      });
      let del = c === 0;

      if (del) {
        await publisher.destroy({ transaction });
        publisherCount++;
      }
    });
    logger.info(`Deleted ${publisherCount} publishers.`);

    //Remove all Individuals without content
    const individuals = await models.Individual.findAll({ transaction });
    let individualCount = 0;
    await asyncForEach(individuals, async (individual) => {
      let c = await models.Cover_Individual.count({
        where: { fk_individual: individual.id },
        transaction,
      });
      let del = c === 0;

      if (del) {
        c = await models.Story_Individual.count({
          where: { fk_individual: individual.id },
          transaction,
        });
        del = c === 0;
      }

      if (del) {
        c = await models.Feature_Individual.count({
          where: { fk_individual: individual.id },
          transaction,
        });
        del = c === 0;
      }

      if (del) {
        c = await models.Issue_Individual.count({
          where: { fk_individual: individual.id },
          transaction,
        });
        del = c === 0;
      }

      if (del) {
        await individual.destroy({ transaction });
        individualCount++;
      }
    });
    logger.info(`Deleted ${individualCount} individuals.`);

    //Remove all arcs without content
    const arcs = await models.Arc.findAll({ transaction });
    let arcCount = 0;
    await asyncForEach(arcs, async (arc) => {
      let c = await models.Issue_Arc.count({ where: { fk_arc: arc.id }, transaction });
      let del = c === 0;

      if (del) {
        await arc.destroy({ transaction });
        arcCount++;
      }
    });
    logger.info(`Deleted ${arcCount} arcs.`);

    // Keep session table small and remove stale rows.
    const now = new Date();
    const revokedRetentionCutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deletedSessions = await models.UserSession.destroy({
      where: {
        [Op.or]: [
          { expiresat: { [Op.lte]: now } },
          { revokedat: { [Op.lte]: revokedRetentionCutoff } },
        ],
      },
      transaction,
    });
    logger.info(`Deleted ${deletedSessions} sessions.`);

    const loginAttemptRetentionCutoff = new Date(
      now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deletedLoginAttempts = await models.LoginAttempt.destroy({
      where: {
        updatedAt: { [Op.lte]: loginAttemptRetentionCutoff },
      },
      transaction,
    });
    logger.info(`Deleted ${deletedLoginAttempts} login attempts.`);

    await transaction.commit();
    logger.info('Cleanup done.');
  } catch (e) {
    logger.error('Error during cleanup:', e);
    await transaction.rollback();
    logger.info('Error during cleanup... rolling back.');
  }
}
