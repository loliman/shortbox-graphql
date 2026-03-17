export type ChangeRequestType = 'SERIES' | 'ISSUE' | 'PUBLISHER';

export interface ChangeRequestEntity {
  id: number;
  issueId: number;
  createdAt: Date;
  type: ChangeRequestType;
  changeRequest: Record<string, unknown>;
}

export interface CreateChangeRequestInput {
  issueId: number;
  type: ChangeRequestType;
  changeRequest: Record<string, unknown>;
}
