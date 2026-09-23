'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { usePlugins } from '@/hooks/usePlugins';

export function PluginManager() {
  const { theme } = useTheme();
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
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px 0' }}>
            Plugin Manager
          </h1>
          <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
            Extend DWO with community and built-in plugins
          </p>
        </div>
        <button style={styles.button(theme)}>
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
          background: theme.colors.bg,
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.text,
          padding: '10px 12px',
          borderRadius: '6px',
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
            color: theme.colors.textMuted,
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
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>
                  {plugin.manifest.name}
                </div>
                <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '4px' }}>
                  {plugin.manifest.description}
                </div>
                <div style={{ fontSize: '10px', color: theme.colors.textMuted, marginTop: '4px' }}>
                  v{plugin.manifest.version} by {plugin.manifest.author}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggle(plugin)}
                  style={{
                    padding: '6px 12px',
                    background: plugin.manifest.enabled ? theme.colors.accent : theme.colors.bgTertiary,
                    color: plugin.manifest.enabled ? '#fff' : theme.colors.textMuted,
                    border: 'none',
                    borderRadius: '4px',
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
  button: (t: any) => ({
    background: t.colors.accent,
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
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
