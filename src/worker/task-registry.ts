export type ReimportScopePayload =
  | { kind: 'all-us' }
  | { kind: 'publisher'; publisherId: number }
  | { kind: 'series'; seriesId: number }
  | { kind: 'issue'; issueId: number };

export type CleanupTaskPayload = {
  dryRun?: boolean;
};

export type UpdateStoryFiltersTaskPayload = {
  dryRun?: boolean;
  batchSize?: number;
};

export type ReimportUSTaskPayload = {
  dryRun?: boolean;
  scope?: ReimportScopePayload;
};

export type AdminTaskPayloads = {
  'cleanup-db': CleanupTaskPayload;
  'update-story-badges': UpdateStoryFiltersTaskPayload;
  'reimport-us': ReimportUSTaskPayload;
};

export type AdminTaskName = keyof AdminTaskPayloads;

export type AdminTaskDefinition<TName extends AdminTaskName = AdminTaskName> = {
  name: TName;
  label: string;
  description: string;
};

export const ADMIN_TASK_DEFINITIONS: AdminTaskDefinition[] = [
  {
    name: 'cleanup-db',
    label: 'Cleanup',
    description: 'Entfernt inkonsistente Daten in der Datenbank.',
  },
  {
    name: 'update-story-badges',
    label: 'Update Story Badges',
    description: 'Berechnet Story Badges für alle Issues neu.',
  },
  {
    name: 'reimport-us',
    label: 'Reimport US Issues',
    description:
      'Crawlt US-Issues neu, korrigiert normale Datenabweichungen und markiert manuelle Konflikte.',
  },
];

export const ADMIN_TASK_DEFINITION_BY_NAME: Record<AdminTaskName, AdminTaskDefinition> = {
  'cleanup-db': ADMIN_TASK_DEFINITIONS[0],
  'update-story-badges': ADMIN_TASK_DEFINITIONS[1],
  'reimport-us': ADMIN_TASK_DEFINITIONS[2],
};

export const isAdminTaskName = (value: string): value is AdminTaskName =>
  ADMIN_TASK_DEFINITIONS.some((task) => task.name === value);

export const MAX_TASK_DETAILS_CHARS = 1_000_000;

export const toStoredDetails = (details: string): string => {
  if (details.length <= MAX_TASK_DETAILS_CHARS) return details;
  return (
    details.slice(0, MAX_TASK_DETAILS_CHARS) +
    '\n\n[truncated] details exceeded storage limit and were truncated.'
  );
};
