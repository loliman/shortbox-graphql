import fs from 'node:fs';
import path from 'node:path';
import { Task, TaskList } from 'graphile-worker';
import { AdminTaskName, isAdminTaskName } from './task-registry';

const TASK_DIR = path.resolve(__dirname, 'tasks');

const toTaskName = (filename: string): AdminTaskName | null => {
  if (!filename.endsWith('.js') && !filename.endsWith('.ts')) return null;
  if (filename.endsWith('.d.ts')) return null;
  const baseName = filename.replace(/\.(js|ts)$/, '');
  return isAdminTaskName(baseName) ? baseName : null;
};

export const loadTaskList = (): TaskList => {
  const taskList: TaskList = {};

  for (const entry of fs.readdirSync(TASK_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const taskName = toTaskName(entry.name);
    if (!taskName) continue;

    const modulePath = path.join(TASK_DIR, entry.name);
    const loadedModule = require(modulePath) as { default?: unknown };

    if (typeof loadedModule.default !== 'function') {
      throw new Error(`Task module ${entry.name} has no default function export`);
    }

    taskList[taskName] = loadedModule.default as Task<typeof taskName>;
  }

  return taskList;
};
