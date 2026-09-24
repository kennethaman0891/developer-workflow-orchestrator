'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';

export interface Task {
  id: string;
  name: string;
  description: string;
  schedule: string;
  command: string;
  working_dir: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  last_run?: string;
  next_run?: string;
  created_at: string;
}

export interface TaskResult {
  task_id: string;
  started_at: string;
  completed_at: string;
  success: boolean;
  output: string;
  exit_code: number;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [results, setResults] = useState<TaskResult[]>([]);

  const listTasks = useCallback(async () => {
    try {
      const result = await invoke<Task[]>('task_list', undefined, []);
      setTasks(result);
      return result;
    } catch (error) {
      console.error('Failed to list tasks:', error);
      return [];
    }
  }, []);

  const getTask = useCallback(async (id: string): Promise<Task | null> => {
    try {
      return await invoke<Task>('task_get', { id });
    } catch (error) {
      console.error('Failed to get task:', error);
      return null;
    }
  }, []);

  const createTask = useCallback(async (task: Omit<Task, 'id' | 'created_at'>): Promise<string> => {
    try {
      const id = await invoke<string>('task_create', {
        name: task.name,
        description: task.description,
        schedule: task.schedule,
        command: task.command,
        working_dir: task.working_dir,
      });
      await listTasks();
      return id;
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }, [listTasks]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await invoke('task_update_status', { id, status });
      await listTasks();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  }, [listTasks]);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await invoke<boolean>('task_delete', { id });
      if (success) {
        await listTasks();
      }
      return success;
    } catch (error) {
      console.error('Failed to delete task:', error);
      return false;
    }
  }, [listTasks]);

  const saveResult = useCallback(async (result: Omit<TaskResult, 'id'>) => {
    try {
      await invoke('task_save_result', {
        task_id: result.task_id,
        started_at: result.started_at,
        completed_at: result.completed_at,
        success: result.success,
        output: result.output,
        exit_code: result.exit_code,
      });
    } catch (error) {
      console.error('Failed to save task result:', error);
    }
  }, []);

  const getResults = useCallback(async (limit: number = 20): Promise<TaskResult[]> => {
    try {
      const result = await invoke<TaskResult[]>('task_get_results', { limit });
      setResults(result);
      return result;
    } catch (error) {
      console.error('Failed to get task results:', error);
      return [];
    }
  }, []);

  // Load on mount
  useEffect(() => {
    listTasks().catch(console.error);
    getResults().catch(console.error);
  }, [listTasks, getResults]);

  return {
    tasks,
    results,
    listTasks,
    getTask,
    createTask,
    updateStatus,
    deleteTask,
    saveResult,
    getResults,
  };
}
