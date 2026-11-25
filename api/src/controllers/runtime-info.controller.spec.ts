import RuntimeInfoController from './runtime-info.controller';
import { describeRuntime } from '../domain/runtime-info';

test('reports actual MariaDB release and the explicit hosted PRE environment', () => {
  expect(describeRuntime('0.21.0', 'resx-hosted-pre', 'production', 'mysql', '11.8.3-MariaDB-private-host')).toEqual({
    application: 'RESX', version: '0.21.0', environment: 'PRE',
    database: { engine: 'MariaDB', version: '11.8.3', location: 'Contabo PRE' },
  });
});

test('keeps application environment separate from DB target and handles legacy MariaDB banners', () => {
  expect(describeRuntime('0.21.0', 'resx-phase1', 'dev', 'mysql', '5.5.5-11.8.3-MariaDB').database)
    .toEqual({ engine: 'MariaDB', version: '11.8.3', location: 'Contabo PRE' });
  expect(describeRuntime('0.21.0', 'resx-local-dev', 'dev', 'postgres', 'PostgreSQL 16.16 (private-build)').database)
    .toEqual({ engine: 'PostgreSQL', version: '16.16', location: 'Contabo DEV' });
});

test('unknown metadata stays unavailable rather than inventing a version or location', () => {
  expect(describeRuntime('0.21.0', undefined, 'dev', 'mysql', null).database)
    .toEqual({ engine: 'MySQL-compatible', version: null, location: 'Location unavailable' });
});

test('version metadata is cached and exposes no private server banner or connection fields', async () => {
  const query = jest.fn().mockResolvedValue([{ version: '11.8.3-MariaDB-private-server' }]);
  const controller = new RuntimeInfoController({ options: { type: 'mysql', password: 'synthetic-private-value' }, query } as any);
  const results = await Promise.all([controller.info(), controller.info()]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith('SELECT VERSION() AS version');
  expect(JSON.stringify(results)).not.toMatch(/private-server|synthetic-private-value|password/);
});

test('database version query failure returns safe unavailable metadata', async () => {
  const controller = new RuntimeInfoController({
    options: { type: 'postgres' }, query: jest.fn().mockRejectedValue(new Error('synthetic-private-connection-error')),
  } as any);
  const result = await controller.info();
  expect(result.database.version).toBeNull();
  expect(JSON.stringify(result)).not.toContain('synthetic-private');
});
