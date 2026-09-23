'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  config: object;
}

export interface PluginState {
  manifest: PluginManifest;
  installed_at: string;
  updated_at?: string;
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginState[]>([]);

  const listPlugins = useCallback(async () => {
    try {
      const result = await invoke<PluginState[]>('plugin_list');
      setPlugins(result);
      return result;
    } catch (error) {
      console.error('Failed to list plugins:', error);
      return [];
    }
  }, []);

  const getPlugin = useCallback(async (id: string): Promise<PluginState | null> => {
    try {
      return await invoke<PluginState>('plugin_get', { id });
    } catch (error) {
      console.error('Failed to get plugin:', error);
      return null;
    }
  }, []);

  const installPlugin = useCallback(async (manifest: PluginManifest) => {
    try {
      await invoke('plugin_install', { manifest: JSON.stringify(manifest) });
      await listPlugins();
    } catch (error) {
      console.error('Failed to install plugin:', error);
    }
  }, [listPlugins]);

  const removePlugin = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await invoke<boolean>('plugin_remove', { id });
      if (success) {
        await listPlugins();
      }
      return success;
    } catch (error) {
      console.error('Failed to remove plugin:', error);
      return false;
    }
  }, [listPlugins]);

  const togglePlugin = useCallback(async (id: string) => {
    try {
      await invoke('plugin_toggle', { id });
      await listPlugins();
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  }, [listPlugins]);

  const enabledPlugins = useCallback(async (): Promise<PluginManifest[]> => {
    try {
      return await invoke<PluginManifest[]>('plugin_enabled');
    } catch (error) {
      console.error('Failed to get enabled plugins:', error);
      return [];
    }
  }, []);

  // Load on mount
  useEffect(() => {
    listPlugins().catch(console.error);
  }, [listPlugins]);

  return {
    plugins,
    listPlugins,
    getPlugin,
    installPlugin,
    removePlugin,
    togglePlugin,
    enabledPlugins,
  };
}
