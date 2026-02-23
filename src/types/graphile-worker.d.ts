import type {
  CleanupTaskPayload,
  ReimportUSTaskPayload,
  UpdateStoryFiltersTaskPayload,
} from '../worker/task-registry';

declare global {
  namespace GraphileWorker {
    interface Tasks {
      cleanup: CleanupTaskPayload;
      'update-story-filters-all': UpdateStoryFiltersTaskPayload;
      'reimport-us': ReimportUSTaskPayload;
    }
  }
}

export {};
