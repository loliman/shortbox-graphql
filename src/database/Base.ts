import {Model} from 'objection';
import {BaseQueryBuilder} from './BaseQueryBuilder';

// @ts-ignore
export class Base extends Model {
  createdAt!: string;
  updatedAt!: string;

  static get QueryBuilder() {
    return BaseQueryBuilder;
  }

  static get modelPaths() {
    return [__dirname];
  }

  $beforeInsert() {
    this.createdAt = new Date()
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');
    this.updatedAt = this.createdAt;
  }

  $beforeUpdate() {
    this.updatedAt = new Date()
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');
  }
}
