import {Model, QueryBuilder} from 'objection';

export class BaseQueryBuilder extends QueryBuilder<any> {
  async findOrInsert(model: Model) {
    return new Promise(async (resolve, reject) => {
      try {
        let res = await this.where(model).first();

        if (!res) {
          res = await this.insert(model);
        }

        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }
}
