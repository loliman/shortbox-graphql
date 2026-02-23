import type {
  CleanupTaskPayload,
  ReimportUSTaskPayload,
  UpdateStoryFiltersTaskPayload,
} from '../worker/task-registry';

declare global {
  namespace GraphileWorker {
    interface Tasks {
      cleanup: CleanupTaskPayload;
      'update-story-badges': UpdateStoryFiltersTaskPayload;
      'reimport-us': ReimportUSTaskPayload;
    }
  }
}

export {};
