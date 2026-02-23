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
  cleanup: CleanupTaskPayload;
  'update-story-filters-all': UpdateStoryFiltersTaskPayload;
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
    name: 'cleanup',
    label: 'Cleanup',
    description: 'Entfernt inkonsistente/orphaned Daten und erstellt einen Stufen-Report.',
  },
  {
    name: 'update-story-filters-all',
    label: 'Update Story Filters (All DE)',
    description: 'Berechnet Story-Filter-Flags für alle DE-Issues neu.',
  },
  {
    name: 'reimport-us',
    label: 'Reimport US Issues',
    description:
      'Crawlt US-Issues neu, korrigiert normale Datenabweichungen und markiert manuelle Konflikte.',
  },
];

export const ADMIN_TASK_DEFINITION_BY_NAME: Record<AdminTaskName, AdminTaskDefinition> = {
  cleanup: ADMIN_TASK_DEFINITIONS[0],
  'update-story-filters-all': ADMIN_TASK_DEFINITIONS[1],
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
