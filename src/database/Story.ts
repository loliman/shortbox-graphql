import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Individual} from './Individual';
import {Issue} from './Issue';
import {Appearance} from './Appearance';

export class Story extends Base {
  static tableName = 'story';

  public id!: number;
  public title!: string;
  public number!: number;
  public coloured!: number;
  public addinfo!: string;
  public pages!: string;
  public onlyapp!: number;
  public firstapp!: number;
  public firstpartly!: number;
  public firstcomplete!: number;
  public firstmonochrome!: number;
  public firstcoloured!: number;
  public exclusive!: number;
  public onlytb!: number;
  public onlyoneprint!: number;
  public onlypartly!: number;
  public onlymonochrome!: number;

  public parent!: Story;
  public children!: Story[];
  public issue!: Issue;
  public reprints!: Story[];
  public reprintOf!: Story;
  public individuals!: Individual[];
  public appearances!: Appearance[];

  static jsonSchema = {
    type: 'object',
    required: ['number'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 1000},
      number: {type: 'integer'},
      coloured: {type: 'integer'},
      fullsize: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
      pages: {type: 'string', minLength: 1, maxLength: 1000},
      onlyapp: {type: 'integer'},
      firstapp: {type: 'integer'},
      firstpartly: {type: 'integer'},
      firstcomplete: {type: 'integer'},
      firstmonochrome: {type: 'integer'},
      firstcoloured: {type: 'integer'},
      onlytb: {type: 'integer'},
      onlyoneprint: {type: 'integer'},
      onlypartly: {type: 'integer'},
      onlymonochrome: {type: 'integer'},
    },
  };

  static relationMappings = {
    children: {
      relation: Model.HasManyRelation,
      modelClass: 'Story',
      join: {
        from: 'story.id',
        to: 'story.fk_parent',
      },
    },
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Story',
      join: {
        from: 'story.fk_parent',
        to: 'story.id',
      },
    },
    reprints: {
      relation: Model.HasManyRelation,
      modelClass: 'Story',
      join: {
        from: 'story.id',
        to: 'story.fk_reprint',
      },
    },
    reprintOf: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Story',
      join: {
        from: 'story.fk_reprint',
        to: 'story.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Issue',
      join: {
        from: 'story.fk_issue',
        to: 'issue.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Individual',
      join: {
        from: 'story.id',
        through: {
          from: 'story_individual.fk_story',
          to: 'story_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    appearances: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Appearance',
      join: {
        from: 'story.id',
        through: {
          from: 'story_appearance.fk_story',
          to: 'story_appearance.fk_appearance',
          extra: ['role', 'firstapp'],
        },
        to: 'appearance.id',
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
                    resolve(await models.Story_Individual.create({fk_story: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async associateAppearance(name, type, role, firstapp, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.OldAppearance.findOrCreate({
                    where: {
                        name: name,
                        type: type
                    },
                    transaction: transaction
                }).then(async ([appearance, created]) => {
                    resolve(await models.Story_Appearance.create({fk_story: this.id, fk_appearance: appearance.id, role: role ? role : "", firstapp: firstapp}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async create(story, issue, transaction, us) {
        return new Promise(async (resolve, reject) => {
            try {
                if (story.exclusive || us) {
                    let resStory = await models.StoryDto.create({
                        number: !isNaN(story.number) ? story.number : 1,
                        title: story.title ? story.title.trim() : '',
                        addinfo: story.addinfo,
                        pages: pagesArrayToString(story.pages),
                        coloured: story.coloured,
                        fk_issue: issue.id
                    }, {transaction: transaction});

                    if(story.individuals)
                        await asyncForEach(story.individuals, async individual => {
                            if(individual.name && individual.name.trim() !== '')
                                await asyncForEach(individual.type, async type => {
                                    await resStory.associateIndividual(individual.name.trim(), type, transaction);
                                });
                        });

                    if(story.appearances)
                        await asyncForEach(story.appearances, async appearance => {
                            if(appearance.name && appearance.name.trim() !== '')
                                await resStory.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, appearance.firstApp, transaction);
                        });

                    if(story.reprintOf) {
                        let pub = await models.OldPublisher.findOne({
                            where: {
                                name: story.reprintOf.series.publisher.name
                            }, transaction: transaction
                        });

                        if(!pub) {
                            pub =await createPublisher(story.reprintOf.series.publisher, transaction);
                        }

                        let series = await models.OldSeries.findOne({
                            where: {
                                title: story.reprintOf.series.title,
                                volume: story.reprintOf.series.volume,
                                fk_publisher: pub.id
                            }, transaction: transaction
                        });

                        if(!series) {
                            series = await createSeries(story.reprintOf.series, transaction);
                        }

                        let o = await models.OldIssue.findOne({
                            where: {
                                '$OldSeries->OldPublisher.original$': us,
                                '$OldSeries.title$': story.reprintOf.series.title,
                                '$OldSeries.volume$': story.reprintOf.series.volume,
                                'number': story.reprintOf.number
                            },
                            group: ['fk_series', 'number'],
                            include: [
                                {
                                    model: models.OldSeries,
                                    include: [
                                        models.OldPublisher
                                    ]
                                }
                            ], transaction: transaction
                        });

                        if(!o) {
                            o = await createIssue(story.reprintOf, transaction);
                        }

                        let os = await o.getStories({transaction: transaction});

                        if(os[Number.parseInt(story.reprintOf.story-1)])
                            resStory.fk_reprint = os[Number.parseInt(story.reprintOf.story-1)].id;
                        else
                            resStory.fk_reprint = os[0].id;
                    }

                    await resStory.save({transaction: transaction});
                } else {
                    let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);

                    let oStories = await resIssue.getStories({transaction: transaction});
                    let oStory;

                    oStories.forEach(e => {
                        if (e.number === story.parent.number)
                            oStory = e;
                    });

                    if (!oStory)
                        throw new Error("Geschichte " + story.parent.issue.series.title + " (Vol." + story.parent.issue.series.volume + ") " + story.parent.issue.number + " [" + romanize(story.parent.number) + "] nicht gefunden");
                    else if(oStory.fk_reprint) {
                        oStory = await oStory.getOriginal({transaction: transaction});
                    }

                    let newStory = await models.StoryDto.create({
                        title: story.title && story.title.trim() ? story.title.trim() : '',
                        number: !isNaN(story.number) ? story.number : 1,
                        addinfo: story.addinfo ? story.addinfo : '',
                        pages: pagesArrayToString(story.pages),
                        coloured: story.coloured,
                        fk_parent: oStory.id
                    }, {transaction: transaction});

                    if(story.individuals)
                        await asyncForEach(story.individuals, async individual => {
                            if(individual.name && individual.name.trim() !== '')
                                await asyncForEach(individual.type, async type => {
                                    await newStory.associateIndividual(individual.name.trim(), type, transaction);
                                });
                        });

                    if(story.appearances)
                        await asyncForEach(story.appearances, async appearance => {
                            if(appearance.name && appearance.name.trim() !== '')
                                await newStory.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, transaction);
                        });

                    await newStory.setIssue(issue, {transaction: transaction});
                    await newStory.save({transaction: transaction});
                }

                story.pages = pagesArrayToString(story.pages);
                resolve(story);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getStories(issue, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let oldStories = [];
                let rawStories = await models.StoryDto.findAll({
                    where: {fk_issue: issue.id},
                    order: [['number', 'ASC']],
                    transaction
                });

                await asyncForEach(rawStories, async story => {
                    let rawStory = {};
                    rawStory.title = story.title;
                    rawStory.number = story.number;
                    rawStory.addinfo = story.addinfo;

                    rawStory.exclusive = story.fk_parent === null;

                    if (story.fk_parent !== null) {
                        let rawParent = await models.StoryDto.findOne({where: {id: story.fk_parent}, transaction});
                        let rawIssue = await models.OldIssue.findOne({where: {id: rawParent.fk_issue}, transaction});
                        let rawSeries = await models.OldSeries.findOne({where: {id: rawIssue.fk_series}, transaction});

                        rawStory.parent = {number: rawParent.number};

                        rawStory.parent.issue = {number: rawIssue.number.toString()};

                        rawStory.parent.issue.series = {
                            title: rawSeries.title,
                            volume: rawSeries.volume,
                        };

                        let individuals = await models.OldIndividual.findAll({
                            include: [{
                                model: models.StoryDto
                            }],
                            where: {
                                '$Stories->Story_Individual.fk_story$': story.id
                            },
                            transaction,
                            raw: true
                        });

                        rawStory.individuals = [];
                        if(individuals) {
                            individuals.forEach(individual => {
                                let i = rawStory.individuals.find(n => n.name === individual.name);

                                if (!i) {
                                    i = {name: individual.name, type: []};
                                    rawStory.individuals.push(i);
                                }

                                i.type.push(individual["Stories.Story_Individual.type"]);
                            });
                        }
                    } else {
                        let individuals = await models.OldIndividual.findAll({
                            include: [{
                                model: models.StoryDto
                            }],
                            where: {
                                '$Stories->Story_Individual.fk_story$': story.id
                            },
                            transaction,
                            raw: true
                        });

                        rawStory.individuals = [];
                        if(individuals)
                            individuals.forEach(individual => {
                                let i = rawStory.individuals.find(n => n.name === individual.name);

                                if(!i) {
                                    i = {name: individual.name, type: []};
                                    rawStory.individuals.push(i);
                                }

                                i.type.push(individual["Stories.Story_Individual.type"]);
                            });

                        let appearances = await models.OldAppearance.findAll({
                            include: [{
                                model: models.StoryDto
                            }],
                            where: {
                                '$Stories->Story_Appearance.fk_story$': story.id
                            },
                            transaction,
                            raw: true
                        });

                        rawStory.appearances = [];
                        if(appearances)
                            appearances.forEach(appearance => {
                                let a = {name: appearance.name, type: appearance.type, role: appearance["Stories.Story_Appearance.role"]};
                                rawStory.appearances.push(a);
                            });
                    }
                    oldStories.push(rawStory);
                });

                resolve(oldStories);
            } catch (e) {
                reject(e);
            }
        });
    }

    equals(a, b) {
        if(a.exclusive !== b.exclusive)
            return false;

        if(a.coloured !== b.coloured)
            return false;

        if(a.title !== b.title || a.number !== b.number || a.addinfo !== b.addinfo)
            return false;

        if(JSON.stringify(a.pages) !== JSON.stringify(b.pages))
            return false;

        if(a.individuals && !b.individuals)
            return false;

        if(a.appearances && !b.appearances)
            return false;

        if(!a.individuals && b.individuals)
            return false;

        if(!a.appearances && b.appearances)
            return false;

        if((a.individuals && b.individuals) && (a.individuals.length !== b.individuals.length))
            return false;

        if((a.appearances && b.appearances) && (a.appearances.length !== b.appearances.length))
            return false;

        let found = a.individuals.every(aIndividual => {
            let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

            if(r)
                return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

            return false;
        });

        found = found && a.appearances.every(aAppearance => {
            return b.appearances.some(bAppearance => {
                return aAppearance.name === bAppearance.name && aAppearance.type === bAppearance.type && aAppearance.role === bAppearance.role;
            });
        });

        if(!a.exclusive) {
            return (found &&
                a.parent.number === b.number &&
                a.parent.issue.number === b.parent.issue.number &&
                a.parent.issue.series.title === b.parent.issue.series.title &&
                a.parent.issue.series.volume === b.parent.issue.series.volume
            );
        } else {
            return found
        }
    }

    pagesArrayToString(pages) {
        if(!pages || pages.length === 0)
            return null;

        let res = "";

        pages.forEach(p => res += ("#" + p + "#"));

        return res;
    }*/
}

type StoryDto = ModelObject<Story>;
