'use client';

import { useState } from 'react';

export function DistributionPanel() {
    const [platform, setPlatform] = useState<'macos' | 'windows' | 'linux'>('macos');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildLog, setBuildLog] = useState<string[]>([]);

  const platforms = [
    { id: 'macos' as const, label: 'macOS', icon: '🍎', archs: ['x64', 'arm64'] },
    { id: 'windows' as const, label: 'Windows', icon: '🪟', archs: ['x64'] },
    { id: 'linux' as const, label: 'Linux', icon: '🐧', archs: ['x64', 'arm64'] },
  ];

  const handleBuild = async () => {
    setIsBuilding(true);
    setBuildProgress(0);
    setBuildLog(['Starting build...', `Platform: ${platform}`, 'Compiling Rust backend...']);

    // Simulate build progress
    for (let i = 10; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setBuildProgress(i);
      setBuildLog(prev => [...prev, `Step ${i}% complete...`]);
    }

    setIsBuilding(false);
    setBuildLog(prev => [...prev, 'Build completed successfully!']);
  };

  const currentPlatform = platforms.find(p => p.id === platform)!;

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--dwo-color-text)', margin: '0 0 8px 0' }}>
          Build & Distribution
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--dwo-color-text-muted)', margin: 0 }}>
          Package DWO for distribution across platforms
        </p>
      </div>

      {/* Platform selection */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '12px' }}>Target Platform</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {platforms.map(p => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              disabled={isBuilding}
              style={{
                padding: '20px',
                background: platform === p.id ? 'var(--dwo-color-bg-tertiary)' : 'var(--dwo-color-bg-secondary)',
                border: `2px solid ${platform === p.id ? 'var(--dwo-color-accent)' : 'var(--dwo-color-border)'}`,
                borderRadius: '8px',
                cursor: isBuilding ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                opacity: isBuilding && platform !== p.id ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{p.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>{p.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Architecture options */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '8px' }}>Architectures</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {currentPlatform.archs.map(arch => (
            <div key={arch} style={{
              padding: '6px 12px',
              background: 'var(--dwo-color-bg-tertiary)',
              border: `1px solid var(--dwo-color-border)`,
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--dwo-color-text)',
            }}>
              {arch}
            </div>
          ))}
        </div>
      </div>

      {/* Build button */}
      <button
        onClick={handleBuild}
        disabled={isBuilding}
        style={{
          width: '100%',
          padding: '12px',
          background: isBuilding ? 'var(--dwo-color-bg-tertiary)' : 'var(--dwo-color-accent)',
          color: isBuilding ? 'var(--dwo-color-text-muted)' : '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: isBuilding ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          marginBottom: '16px',
        }}
      >
        {isBuilding ? `Building ${buildProgress}%...` : `Build for ${currentPlatform.label}`}
      </button>

      {/* Build log */}
      {buildLog.length > 0 && (
        <div style={{
          padding: '12px',
          background: 'var(--dwo-color-bg)',
          border: `1px solid var(--dwo-color-border)`,
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '11px',
          color: 'var(--dwo-color-text-muted)',
          maxHeight: '200px',
          overflow: 'auto',
        }}>
          {buildLog.map((log, i) => (
            <div key={i} style={{ marginBottom: '2px' }}>{log}</div>
          ))}
        </div>
      )}

      {/* Output directory info */}
      <div style={{ marginTop: '16px', padding: '12px', background: 'var(--dwo-color-bg-secondary)', borderRadius: '6px', border: `1px solid var(--dwo-color-border)` }}>
        <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)' }}>
          Output: <code style={{ color: 'var(--dwo-color-accent)' }}>src-tauri/bin/{platform}/</code>
        </div>
      </div>
    </div>
  );
}
