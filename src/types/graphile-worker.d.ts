import type {
  CleanupTaskPayload,
  ReimportUSTaskPayload,
  UpdateDeSeriesGenresTaskPayload,
  UpdateStoryFiltersTaskPayload,
} from '../worker/task-registry';

declare global {
  namespace GraphileWorker {
    interface Tasks {
      cleanup: CleanupTaskPayload;
      'update-story-badges': UpdateStoryFiltersTaskPayload;
      'reimport-us': ReimportUSTaskPayload;
      'update-de-series-genres': UpdateDeSeriesGenresTaskPayload;
    }
  }
}

export {};
