import type { Transaction } from 'sequelize';
import type { DbModels } from '../types/db';
import type {
  ChangeRequestEntity,
  ChangeRequestType,
  CreateChangeRequestInput,
} from '../types/changeRequest';

type ChangeRequestRow = {
  id: number;
  fk_issue: number;
  createdat: Date;
  type: ChangeRequestType;
  changerequest: Record<string, unknown>;
};

const mapRowToEntity = (row: ChangeRequestRow): ChangeRequestEntity => ({
  id: row.id,
  issueId: row.fk_issue,
  createdAt: row.createdat,
  type: row.type,
  changeRequest: row.changerequest || {},
});

export class ChangeRequestRepository {
  constructor(private readonly models: DbModels) {}

  async create(
    input: CreateChangeRequestInput,
    transaction?: Transaction,
  ): Promise<ChangeRequestEntity> {
    const created = (await this.models.ChangeRequest.create(
      {
        fk_issue: input.issueId,
        type: input.type,
        changerequest: input.changeRequest,
      },
      transaction ? { transaction } : undefined,
    )) as unknown as ChangeRequestRow;

    return mapRowToEntity(created);
  }

  async findById(id: number, transaction?: Transaction): Promise<ChangeRequestEntity | null> {
    const row = (await this.models.ChangeRequest.findByPk(
      id,
      transaction ? { transaction } : undefined,
    )) as unknown as ChangeRequestRow | null;
    if (!row) return null;
    return mapRowToEntity(row);
  }

  async findAll(params?: {
    type?: ChangeRequestType;
    order?: string;
    direction?: string;
    transaction?: Transaction;
  }): Promise<ChangeRequestEntity[]> {
    const where: Record<string, unknown> = {};
    if (params?.type) where.type = params.type;
    const direction = String(params?.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderColumn = String(params?.order || '').toLowerCase() === 'id' ? 'id' : 'createdat';

    const rows = (await this.models.ChangeRequest.findAll({
      where,
      order: [[orderColumn, direction]],
      ...(params?.transaction ? { transaction: params.transaction } : {}),
    })) as unknown as ChangeRequestRow[];

    return rows.map(mapRowToEntity);
  }

  async count(params?: { type?: ChangeRequestType; transaction?: Transaction }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (params?.type) where.type = params.type;

    return await this.models.ChangeRequest.count({
      where,
      ...(params?.transaction ? { transaction: params.transaction } : {}),
    });
  }

  async deleteById(id: number, transaction?: Transaction): Promise<boolean> {
    const affected = await this.models.ChangeRequest.destroy({
      where: { id },
      ...(transaction ? { transaction } : {}),
    });
    return affected > 0;
  }
}
