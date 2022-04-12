import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Individual} from './Individual';
import {Cover} from './Cover';
import {Arc} from './Arc';
import {Feature} from './Feature';
import {Series} from './Series';
import {Story} from './Story';

export class Issue extends Base {
  static tableName = 'issue';

  id!: number;
  title!: string;
  number!: string;
  format!: string;
  limitation?: number;
  variant?: string;
  releasedate!: string;
  pages!: number;
  price!: number;
  currency: string = 'EUR';
  addinfo!: string;
  verified: number = 0;
  edited: number = 0;

  series!: Series;
  cover!: Cover;
  variants?: Issue[];
  individuals!: Individual[];
  stories!: Story[];
  features!: Feature[];
  arcs!: Arc[];

  static jsonSchema = {
    type: 'object',
    required: ['number', 'format'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 0, maxLength: 255},
      number: {type: 'string', minLength: 1, maxLength: 255},
      format: {type: 'string', minLength: 1, maxLength: 255},
      limitation: {type: 'integer'},
      variant: {type: 'string', minLength: 0, maxLength: 255},
      releasedate: {type: 'Date'},
      pages: {type: 'integer'},
      price: {type: 'float'},
      currency: {type: 'string', minLength: 0, maxLength: 3},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      verified: {type: 'integer'},
      edited: {type: 'integer'},
    },
  };

  static relationMappings = {
    series: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Series',
      join: {
        from: 'issue.fk_series',
        to: 'series.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Individual',
      join: {
        from: 'issue.id',
        through: {
          from: 'issue_individual.fk_issue',
          to: 'issue_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    cover: {
      relation: Model.HasOneRelation,
      modelClass: 'Cover',
      join: {
        from: 'issue.id',
        to: 'cover.fk_issue',
      },
    },
    arcs: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Arc',
      join: {
        from: 'issue.id',
        through: {
          from: 'issue_arc.fk_issue',
          to: 'issue_arc.fk_arc',
        },
        to: 'arc.id',
      },
    },
    stories: {
      relation: Model.HasManyRelation,
      modelClass: 'Story',
      join: {
        from: 'issue.id',
        to: 'story.fk_issue',
      },
    },
    features: {
      relation: Model.HasManyRelation,
      modelClass: 'Feature',
      join: {
        from: 'issue.id',
        to: 'feature.fk_issue',
      },
    },
  };

  /*async associateIndividual(name, type, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.OldIndividual.findOrCreate({
                    where: {
                        name: name
                    },
                    transaction: transaction
                }).then(async ([individual, created]) => {
                    resolve(await models.Issue_Individual.create({fk_issue: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async associateArc(title, type, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.OldArc.findOrCreate({
                    where: {
                        title: title,
                        type: type
                    },
                    transaction: transaction
                }).then(async ([arc, created]) => {
                    resolve(await models.Issue_Arc.create({fk_issue: this.id, fk_arc: arc.id}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let cover = await models.OldCover.findOne({where: {fk_issue: this.id, number: 0}, transaction});
                if(cover)
                    if(!cover.url.indexOf('http') === 0)
                        deleteFile(cover.url);

                await models.StoryDto.destroy({where: {fk_issue: this.id}, transaction});
                await models.OldFeature.destroy({where: {fk_issue: this.id}, transaction});
                await models.OldCover.destroy({where: {fk_issue: this.id}, transaction});

                let del = await this.destroy({transaction});
                resolve(del);
            } catch (e) {
                reject(e);
            }
        });
    }

    async create(item, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let series = await models.OldSeries.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$OldPublisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.OldPublisher],
                    transaction
                });

                let pub = await series.getPublisher({transaction: transaction});
                let us = pub.original;

                let releasedate = item.releasedate;
                if(parseInt(releasedate.toLocaleString().substring(0, 4)) < series.startyear)
                    releasedate.setFullYear(series.startyear);

                let res = await models.OldIssue.create({
                    title: item.title ? item.title.trim() : '',
                    fk_series: series.id,
                    number: item.number.trim(),
                    format: item.format ? item.format.trim() : '',
                    variant: item.variant ? item.variant.trim() : '',
                    limitation: !isNaN(item.limitation) ? item.limitation : 0,
                    pages: !isNaN(item.pages) ? item.pages : 0,
                    releasedate: releasedate,
                    price: !isNaN(item.price) && item.price !== '' ? item.price : '0',
                    currency: item.currency ? item.currency.trim() : '',
                    addinfo: item.addinfo,
                    edited: item.edited
                }, {transaction: transaction});

                let coverUrl = '';
                if (item.cover && item.cover.url) {
                    coverUrl = item.cover.url;
                    await createCover(item.cover, res, coverUrl, transaction, us);
                }
                else if (item.cover)
                    coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);

                if (us && item.individuals.length > 0) {
                    await asyncForEach(item.individuals, async individual => {
                        if (individual.name && individual.name.trim() !== '')
                            await asyncForEach(individual.type, async type => {
                                await res.associateIndividual(individual.name.trim(), type, transaction);
                            });
                    });

                    await res.save({transaction: transaction});
                }

                if (item.stories) {
                    let stories = [];
                    await asyncForEach(item.stories, async (story) => {
                        if(story.parent && story.parent.number === 0) {
                            let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                            let oStories = await models.StoryDto.findAll({where: {fk_issue: resIssue.id}, order: [['number', 'ASC']], transaction});

                            for(let i = 0; i < oStories.length; i++) {
                                stories.push({
                                    number: stories.length+1,
                                    parent: {number: i+1, issue: story.parent.issue},
                                    translators: story.translators,
                                    addinfo: '',
                                    exclusive: false
                                });
                            }
                        } else {
                            story.number = stories.length+1;
                            stories.push(story);
                        }
                    });

                    await asyncForEach(stories, async (story) => await createStory(story, res, transaction, us));
                }

                if (item.features && !us)
                    await asyncForEach(item.features, async feature => await createFeature(feature, res, transaction));

                if (item.covers  && !us)
                    await asyncForEach(item.covers, async cover => await createCover(cover, res, coverUrl, transaction, us));

                if (item.arcs)
                    await asyncForEach(item.arcs, async arc => await createArc(arc, res, transaction, us));

                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    }

    findOrCrawlIssue(i, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let series = await models.OldSeries.findOne({
                    where: {
                        title: i.series.title.trim(),
                        volume: i.series.volume,
                        '$OldPublisher.original$': 1
                    },
                    include: [models.OldPublisher],
                    transaction
                });

                let issueCreated = false;
                let issue = await models.OldIssue.findOne({
                    where: {
                        number: i.number.trim(),
                        variant: "",
                        '$OldSeries.title$': i.series.title.trim(),
                        '$OldSeries.volume$': i.series.volume,
                        '$OldSeries->OldPublisher.original$': 1,
                    },
                    include: [
                        {
                            model: models.OldSeries,
                            include: [
                                models.OldPublisher
                            ]
                        }
                    ],
                    transaction
                });

                let crawledIssue;

                if(!issue) {
                    crawledIssue = await crawl(i);

                    if(!series) {
                        let [publisher] = await models.OldPublisher.findOrCreate({
                            where: {
                                name: crawledIssue.series.publisher.name
                            },
                            defaults: {
                                name: crawledIssue.series.publisher.name,
                                addinfo: '',
                                original: 1,
                            },
                            transaction: transaction
                        });

                        series = await models.OldSeries.create({
                            title: crawledIssue.series.title,
                            volume: crawledIssue.series.volume,
                            startyear: !isNaN(crawledIssue.series.startyear) ? crawledIssue.series.startyear : 0,
                            endyear: !isNaN(crawledIssue.series.endyear) ? crawledIssue.series.endyear : 0,
                            addinfo: '',
                            fk_publisher: publisher.id
                        }, {transaction: transaction});
                    }

                    issue = await models.OldIssue.create({
                        title: '',
                        number: i.number,
                        format: 'Heft',
                        fk_series: series.id,
                        releasedate: crawledIssue.releasedate,
                        limitation: 0,
                        pages: 0,
                        price: 0,
                        currency: 'USD',
                        addinfo: ''
                    }, {transaction: transaction});

                    await asyncForEach(crawledIssue.individuals, async (individual) => {
                        await asyncForEach(individual.type, async i => {
                            await issue.associateIndividual(individual.name.trim(), i, transaction);
                        });
                    });
                    await issue.save({transaction: transaction});

                    await asyncForEach(crawledIssue.arcs, async (arc) => {
                        await createArc(arc, issue, transaction);
                    });

                    issueCreated = true;
                }

                if (issueCreated) {
                    let newCover = await models.OldCover.create({
                        url: crawledIssue.cover.url,
                        number: 0,
                        addinfo: ''
                    }, {transaction: transaction});

                    await asyncForEach(crawledIssue.cover.individuals, async (artist) => {
                        await newCover.associateIndividual(artist.name.trim(), 'ARTIST', transaction);
                        await newCover.save({transaction: transaction});
                    });
                    await newCover.setIssue(issue, {transaction: transaction});
                    await newCover.save({transaction: transaction});

                    await Promise.all(crawledIssue.variants.map(async (crawledVariant) => {
                        let variant = await models.OldIssue.create({title: '',
                            number: i.number,
                            format: 'Heft',
                            variant: crawledVariant.variant,
                            fk_series: series.id,
                            releasedate: crawledIssue.releasedate,
                            limitation: 0,
                            pages: 0,
                            price: 0,
                            currency: crawledIssue.currency ? crawledIssue.currency : 'USD',
                            addinfo: ''
                        }, {transaction: transaction});

                        await asyncForEach(crawledIssue.individuals, async (individual) => {
                            await asyncForEach(individual.type, async t => {
                                await variant.associateIndividual(individual.name.trim(), t, transaction);
                            });
                        });
                        await variant.save({transaction: transaction});

                        let newCover = await models.OldCover.create({
                            url: crawledVariant.cover.url,
                            number: 0,
                            addinfo: ''
                        }, {transaction: transaction});

                        await newCover.setIssue(variant, {transaction: transaction});
                        await newCover.save({transaction: transaction});

                        return variant;
                    }));

                    await Promise.all(crawledIssue.stories.map(async (crawledStory) => {
                        let newStory = await models.StoryDto.create({
                            title: crawledStory.title ? crawledStory.title : '',
                            number: !isNaN(crawledStory.number) ? crawledStory.number : 1,
                            addinfo: ''
                        }, {transaction: transaction});

                        await asyncForEach(crawledStory.individuals, async (individual) => {
                            await asyncForEach(individual.type, async t => {
                                await newStory.associateIndividual(individual.name.trim(), t, transaction);
                            });
                        });
                        await newStory.setIssue(issue, {transaction: transaction});
                        await newStory.save({transaction: transaction});

                        return newStory;
                    }));
                }

                resolve(issue);
            } catch (e) {
                reject(e);
            }
        })
    }

    async createCoverForIssue(cover, covers, issue, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                const {createReadStream, filename} = await cover;
                const stream = createReadStream();
                const {hash} = await storeFile({stream, filename});

                let coverUrl = '/' + coverDir + '/' + hash;

                let isCoverInArray;
                if(covers)
                    covers.forEach(e => {
                        if(e.number === 0)
                            isCoverInArray = true;
                    });

                if(!isCoverInArray) {
                    let res = await models.OldCover.create({
                        url: coverUrl,
                        number: 0,
                        addinfo: ''
                    }, {transaction: transaction});

                    res.setIssue(issue, {transaction: transaction});
                    await res.save({transaction: transaction});
                } //else it's handled during array iteration

                resolve(coverUrl);
            } catch (e) {
                reject(e);
            }
        });
    }*/
}

type IssueDto = ModelObject<Issue>;
