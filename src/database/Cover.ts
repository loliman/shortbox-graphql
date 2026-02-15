import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Individual} from './Individual';
import {Issue} from './Issue';
import {Appearance} from './Appearance';

export class Cover extends Base {
  static tableName = 'cover';

  public id!: number;
  public url!: string;
  public number!: number; //Front means 0
  public coloured!: number;
  public fullsize!: number;
  public addinfo!: string;
  public onlyapp!: number;
  public firstapp!: number;
  public firstpartly!: number;
  public firstcomplete!: number;
  public firstmonochrome!: number;
  public firstcoloured!: number;
  public firstsmall!: number;
  public firstfullsize!: number;
  public exclusive!: number;
  public onlytb!: number;
  public onlyoneprint!: number;
  public onlypartly!: number;
  public onlymonochrome!: number;
  public onlysmall!: number;

  public parent!: Cover;
  public children!: Cover[];
  public issue!: Issue;
  public individuals!: Individual[];

  static jsonSchema = {
    type: 'object',
    required: ['url', 'number'],

    properties: {
      id: {type: 'integer'},
      url: {type: 'string', minLength: 0, maxLength: 1000},
      number: {type: 'integer'},
      coloured: {type: 'integer'},
      fullsize: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
      onlyapp: {type: 'integer'},
      firstapp: {type: 'integer'},
      firstpartly: {type: 'integer'},
      firstcomplete: {type: 'integer'},
      firstmonochrome: {type: 'integer'},
      firstcoloured: {type: 'integer'},
      firstsmall: {type: 'integer'},
      firstfullsize: {type: 'integer'},
      onlytb: {type: 'integer'},
      onlyoneprint: {type: 'integer'},
      onlypartly: {type: 'integer'},
      onlymonochrome: {type: 'integer'},
      onlysmall: {type: 'integer'},
    },
  };

  static relationMappings = {
    children: {
      relation: Model.HasManyRelation,
      modelClass: 'Cover',
      join: {
        from: 'cover.id',
        to: 'cover.fk_parent',
      },
    },
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Cover',
      join: {
        from: 'cover.fk_parent',
        to: 'cover.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Issue',
      join: {
        from: 'cover.fk_issue',
        to: 'issue.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Individual',
      join: {
        from: 'cover.id',
        through: {
          from: 'cover_individual.fk_cover',
          to: 'cover_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
  };

  /*async associateIndividual(name: string, type: string, transaction: Transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                sequelize.models.OldIndividual.findOrCreate({
                    where: {
                        name: name
                    },
                    transaction: transaction
                }).then(async ([individual, created]) => {
                    resolve(await sequelize.models.Cover_Individual.create({fk_cover: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async create(cover, issue, coverUrl, transaction, us) {
        return new Promise(async (resolve, reject) => {
            try {
                if (cover.exclusive || us) {
                    let resCover = await models.OldCover.create({
                        number: !isNaN(cover.number) ? cover.number : 1,
                        url: cover.number === 0 ? coverUrl : '',
                        addinfo: cover.addinfo,
                        fullsize: cover.fullsize,
                        coloured: cover.coloured,
                        fk_issue: issue.id
                    }, {transaction: transaction});

                    if(cover.individuals)
                        await asyncForEach(cover.individuals, async individual => {
                            if(individual.name && individual.name.trim() !== '')
                                await asyncForEach(individual.type, async type => {
                                    await resCover.associateIndividual(individual.name.trim(), type, transaction);
                                });
                        });

                    await resCover.save({transaction: transaction});
                } else {
                    let resIssue = await findOrCrawlIssue(cover.parent.issue, transaction);

                    let oVariants = await models.OldIssue.findAll({
                        where: {
                            fk_series: resIssue.fk_series,
                            number: resIssue.number
                        },
                        order: [['number', 'ASC']],
                        transaction
                    });
                    let oVariant;

                    oVariants.forEach(e => {
                        if (e.variant === cover.parent.issue.variant.trim())
                            oVariant = e;
                    });

                    if (!oVariant)
                        throw new Error("Variant " + cover.parent.issue.series.title + " (Vol." + cover.parent.issue.series.volume + ") " + cover.parent.issue.number + " [" + cover.parent.issue.variant + "] nicht gefunden");

                    let oCover = await models.OldCover.findOne({where: {fk_issue: oVariant.id}}, transaction);
                    let newCover = await models.OldCover.create({
                        url: cover.number === 0 ? coverUrl : '',
                        number: !isNaN(cover.number) ? cover.number : 1,
                        addinfo: cover.addinfo,
                        fullsize: cover.fullsize,
                        coloured: cover.coloured,
                        fk_parent: oCover.id
                    }, {transaction: transaction});

                    await newCover.setIssue(issue, {transaction: transaction});
                    await newCover.save({transaction: transaction});
                }

                resolve(cover);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getCovers(issue, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let oldCovers = [];
                let rawCovers = await models.OldCover.findAll({where: {fk_issue: issue.id}, transaction});
                await asyncForEach(rawCovers, async cover => {
                    let rawCover = {};
                    rawCover.number = cover.number;
                    rawCover.addinfo = cover.addinfo;
                    rawCover.url = cover.url;

                    rawCover.exclusive = cover.fk_parent === null;

                    if(cover.fk_parent !== null) {
                        let rawParent = await models.OldCover.findOne({where: {id: cover.fk_parent}, transaction});
                        let rawIssue = await models.OldIssue.findOne({where: {id: rawParent.fk_issue}, transaction});
                        let rawSeries = await models.OldSeries.findOne({where: {id: rawIssue.fk_series}, transaction});

                        rawCover.parent = {};

                        rawCover.parent.issue = {
                            number: rawIssue.number.toString(),
                            variant: rawIssue.variant
                        };

                        rawCover.parent.issue.series = {
                            title: rawSeries.title,
                            volume: rawSeries.volume,
                        };
                    } else {
                        let individuals = await models.OldIndividual.findAll({
                            include: [{
                                model: models.OldCover
                            }],
                            where: {
                                '$Covers->Cover_Individual.fk_cover$': cover.id
                            },
                            transaction,
                            raw: true
                        });

                        rawCover.individuals = [];
                        if(individuals) {
                            individuals.forEach(individual => {
                                let i = rawCover.individuals.find(n => n.name === individual.name);

                                if (!i) {
                                    i = {name: individual.name, type: []};
                                    rawCover.individuals.push(i);
                                }

                                i.type.push(individual["Stories.Cover_Individual.type"]);
                            });
                        }
                    }

                    oldCovers.push(rawCover);
                });

                resolve(oldCovers);
            } catch (e) {
                reject(e);
            }
        });
    }

    export equals(a, b) {
        if(a.exclusive !== b.exclusive)
            return false;

        if(a.coloured !== b.coloured)
            return false;

        if(a.fullsize !== b.fullsize)
            return false;

        if(a.number !== b.number || a.addinfo !== b.addinfo)
            return false;

        if(!a.exclusive) {
            return (
                a.parent.issue.number === b.parent.issue.number &&
                a.parent.issue.variant === b.parent.issue.variant &&
                a.parent.issue.series.title === b.parent.issue.series.title &&
                a.parent.issue.series.volume === b.parent.issue.series.volume
            );
        } else {
            if(a.individuals.length !== b.individuals.length)
                return false;

            return a.individuals.every(aIndividual => {
                let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

                if(r)
                    return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

                return false;
            });
        }
    }*/
}

type CoverDto = ModelObject<Cover>;
