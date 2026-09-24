'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';

export interface AgentTask {
  id: string;
  name: string;
  agent_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  output?: string;
  created_at: string;
  completed_at?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  max_concurrent: number;
}

export function useAgents() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);

  const listTasks = useCallback(async () => {
    try {
      const result = await invoke<AgentTask[]>('agent_list_tasks', undefined, []);
      setTasks(result);
      return result;
    } catch (error) {
      console.error('Failed to list agent tasks:', error);
      return [];
    }
  }, []);

  const getTask = useCallback(async (id: string): Promise<AgentTask | null> => {
    try {
      return await invoke<AgentTask>('agent_get_task', { id });
    } catch (error) {
      console.error('Failed to get agent task:', error);
      return null;
    }
  }, []);

  const createTask = useCallback(async (name: string, agentType: string, config: object): Promise<string> => {
    try {
      const configStr = JSON.stringify(config);
      return await invoke<string>('agent_create_task', { name, agent_type: agentType, config: configStr });
    } catch (error) {
      console.error('Failed to create agent task:', error);
      throw error;
    }
  }, []);

  const updateTaskStatus = useCallback(async (id: string, status: string, progress: number, output?: string) => {
    try {
      await invoke('agent_update_task', { id, status, progress, output });
      await listTasks();
    } catch (error) {
      console.error('Failed to update agent task:', error);
    }
  }, [listTasks]);

  const listConfigs = useCallback(async () => {
    try {
      const result = await invoke<AgentConfig[]>('agent_list_configs', undefined, []);
      setConfigs(result);
      return result;
    } catch (error) {
      console.error('Failed to list agent configs:', error);
      return [];
    }
  }, []);

  const addConfig = useCallback(async (config: AgentConfig) => {
    try {
      await invoke('agent_add_config', { config: JSON.stringify(config) });
      await listConfigs();
    } catch (error) {
      console.error('Failed to add agent config:', error);
    }
  }, [listConfigs]);

  const removeConfig = useCallback(async (id: string) => {
    try {
      await invoke('agent_remove_config', { id });
      await listConfigs();
    } catch (error) {
      console.error('Failed to remove agent config:', error);
    }
  }, [listConfigs]);

  // Load on mount
  useEffect(() => {
    listTasks().catch(console.error);
    listConfigs().catch(console.error);
  }, [listTasks, listConfigs]);

  return {
    tasks,
    configs,
    listTasks,
    getTask,
    createTask,
    updateTaskStatus,
    listConfigs,
    addConfig,
    removeConfig,
  };
}
