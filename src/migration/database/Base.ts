import {Model} from 'objection';

// @ts-ignore
export class Base extends Model {
  private createdAt!: string;
  private updatedAt!: string;

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
