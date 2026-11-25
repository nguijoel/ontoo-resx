export interface RuntimeInfo {
  application: string;
  version: string;
  environment: string;
  database: { engine: string; version: string | null; location: string };
}

// Only public display metadata. Never return connection options, database names,
// account names, addresses, credentials or raw server-version banners.
export function describeRuntime(appVersion: string, profile: string, nodeEnv: string, dbType: string, serverVersion: string | null): RuntimeInfo {
  const profiles: Record<string, { environment: string; location: string }> = {
    'resx-hosted-pre': { environment: 'PRE', location: 'Contabo PRE' },
    'resx-local-dev': { environment: 'development', location: 'Contabo DEV' },
    'resx-phase1': { environment: 'development', location: 'Contabo PRE' },
  };
  const selected = profiles[profile];
  const banner = serverVersion || '';
  const mariaDb = dbType === 'mysql' && /mariadb/i.test(banner);
  const engine = mariaDb ? 'MariaDB' : ({ mysql: serverVersion ? 'MySQL' : 'MySQL-compatible', postgres: 'PostgreSQL', 'better-sqlite3': 'SQLite' }[dbType] || 'Unavailable');
  const release = (mariaDb ? banner.replace(/^5\.5\.5-/, '') : banner).match(/\b(\d+\.\d+(?:\.\d+){0,2})\b/);
  return {
    application: 'RESX',
    version: appVersion,
    environment: selected ? selected.environment : ({ dev: 'development', development: 'development', production: 'production', test: 'test', e2e: 'test' }[nodeEnv] || 'unavailable'),
    database: {
      engine,
      version: release ? release[1] : null,
      location: selected ? selected.location : (dbType === 'better-sqlite3' ? 'Local SQLite' : 'Location unavailable'),
    },
  };
}
