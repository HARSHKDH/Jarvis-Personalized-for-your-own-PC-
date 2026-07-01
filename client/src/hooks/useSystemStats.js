import { useState, useEffect, useCallback } from 'react';

/**
 * useSystemStats — provides mock system stats with realistic variations
 * For real stats, the server /api/health endpoint can be polled
 */
export const useSystemStats = () => {
  const [stats, setStats] = useState({
    cpu: 12,
    ram: 34,
    uptime: 0,
    battery: 87,
    network: 'Online',
    temperature: 42,
  });

  const [serverStats, setServerStats] = useState({
    mongoStatus: 'connecting',
    apiStatus: 'checking',
    serverUptime: 0,
  });

  // Simulate CPU/RAM fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        cpu: Math.min(95, Math.max(5, prev.cpu + (Math.random() * 10 - 5))),
        ram: Math.min(90, Math.max(20, prev.ram + (Math.random() * 4 - 2))),
        temperature: Math.min(85, Math.max(35, prev.temperature + (Math.random() * 2 - 1))),
        uptime: prev.uptime + 1,
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Poll server health endpoint
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setServerStats({
            mongoStatus: data.mongodb === 'connected' ? 'connected' : 'disconnected',
            apiStatus: (data.gemini === 'configured' || data.anthropic === 'configured') ? 'online' : 'offline',
            serverUptime: data.uptime || 0,
          });
        }
      } catch (e) {
        setServerStats(prev => ({
          ...prev,
          mongoStatus: 'disconnected',
          apiStatus: 'offline',
        }));
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = useCallback((seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  return {
    cpu: Math.round(stats.cpu),
    ram: Math.round(stats.ram),
    uptime: formatUptime(stats.uptime),
    battery: stats.battery,
    network: stats.network,
    temperature: Math.round(stats.temperature),
    mongoStatus: serverStats.mongoStatus,
    apiStatus: serverStats.apiStatus,
    serverUptime: serverStats.serverUptime,
  };
};
