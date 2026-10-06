'use client';

import { useState } from 'react';
import { usePlugins } from '@/hooks/usePlugins';

export function PluginManager() {
    const { plugins, togglePlugin, removePlugin } = usePlugins();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlugins = plugins.filter(p =>
    p.manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.manifest.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = async (plugin: typeof plugins[0]) => {
    await togglePlugin(plugin.manifest.id);
  };

  const handleRemove = async (pluginId: string) => {
    if (confirm('Remove this plugin?')) {
      await removePlugin(pluginId);
    }
  };

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--dwo-color-text)', margin: '0 0 8px 0' }}>
            Plugin Manager
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--dwo-color-text-muted)', margin: 0 }}>
            Extend DWO with community and built-in plugins
          </p>
        </div>
        <button style={styles.button()}>
          + Install Plugin
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search plugins..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--dwo-color-bg)',
          border: `1px solid var(--dwo-color-border)`,
          color: 'var(--dwo-color-text)',
          padding: '10px 12px',
          borderRadius: 'var(--dwo-radius-sm)',
          fontSize: '13px',
          marginBottom: '16px',
          boxSizing: 'border-box',
        }}
      />

      {/* Plugins list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredPlugins.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--dwo-color-text-muted)',
            fontSize: '13px',
          }}>
            No plugins installed. Click "+ Install Plugin" to add one.
          </div>
        ) : (
          filteredPlugins.map(plugin => (
            <div key={plugin.manifest.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--dwo-color-bg-secondary)',
              border: `1px solid var(--dwo-color-border)`,
              borderRadius: 'var(--dwo-radius-md)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>
                  {plugin.manifest.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '4px' }}>
                  {plugin.manifest.description}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--dwo-color-text-muted)', marginTop: '4px' }}>
                  v{plugin.manifest.version} by {plugin.manifest.author}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggle(plugin)}
                  style={{
                    padding: '6px 12px',
                    background: plugin.manifest.enabled ? 'var(--dwo-color-accent)' : 'var(--dwo-color-bg-tertiary)',
                    color: plugin.manifest.enabled ? '#fff' : 'var(--dwo-color-text-muted)',
                    border: 'none',
                    borderRadius: 'var(--dwo-radius-sm)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {plugin.manifest.enabled ? 'Enabled' : 'Enable'}
                </button>
                <button
                  onClick={() => handleRemove(plugin.manifest.id)}
                  style={styles.iconButton()}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  button: () => ({
    background: 'var(--dwo-color-accent)',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 'var(--dwo-radius-sm)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  }),
  iconButton: () => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
  }),
};
