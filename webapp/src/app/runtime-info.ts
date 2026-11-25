export interface RuntimeInfo {
  application: string;
  version: string;
  environment: string;
  database: { engine: string; version: string | null; location: string };
}
