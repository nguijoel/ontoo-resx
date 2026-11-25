import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { version } from '../../package.json';
import { config } from '../config';
import { describeRuntime, RuntimeInfo } from '../domain/runtime-info';

@Controller('api/v1/runtime-info')
export default class RuntimeInfoController {
  private versionPromise: Promise<string | null>;
  private expiresAt = 0;

  constructor(@InjectDataSource() private readonly database: DataSource) {}

  @Get()
  @ApiExcludeEndpoint()
  async info(): Promise<RuntimeInfo> {
    const type = this.database.options.type;
    if (!this.versionPromise || Date.now() >= this.expiresAt) {
      // Cache concurrent page loads, and query version metadata only (no rows).
      this.expiresAt = Date.now() + 60000;
      const sql = type === 'better-sqlite3' ? 'SELECT sqlite_version() AS version'
        : type === 'mysql' || type === 'postgres' ? 'SELECT VERSION() AS version' : null;
      this.versionPromise = sql ? this.database.query(sql)
        .then(rows => typeof rows[0]?.version === 'string' ? rows[0].version : null)
        .catch(() => {
          this.expiresAt = Date.now() + 5000;
          return null;
        }) : Promise.resolve(null);
    }
    return describeRuntime(version, process.env.TR_RUNTIME_PROFILE, config.env, type, await this.versionPromise);
  }
}
