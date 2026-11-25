import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ValidationPipe, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { PushController } from './push.controller';
import AuthorizationService from '../services/authorization.service';
import { Term } from '../entity/term.entity';
import { ProjectLocale } from '../entity/project-locale.entity';
import { CustomExceptionFilter } from '../filters/exception.filter';
import { PUSH_UNAVAILABLE_MESSAGE } from '../errors/push-unavailable';

const projectId = '11111111-1111-4111-8111-111111111111';
const keys = ['TR_AWS_S3_REGION', 'TR_AWS_ACCESS_KEY_ID', 'TR_AWS_SECRET_ACCESS_KEY',
  'TR_AWS_S3_BUCKET', 'TR_AWS_CLOUDFRONT_DISTRIBUTION_ID', 'TR_AWS_S3_KEY_TEMPLATE'];
let app: any, termRepo: any, localeRepo: any, builder: any, send: jest.SpyInstance;
let original: Record<string, string | undefined>;
let guard: any, auth: any, cloudFront: jest.SpyInstance;

beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  keys.forEach(key => { process.env[key] = ''; });
  send = jest.spyOn(S3Client.prototype as any, 'send').mockResolvedValue({});
  cloudFront = jest.spyOn(CloudFrontClient.prototype as any, 'send').mockResolvedValue({ Invalidation: { Id: 'synthetic-invalidation', Status: 'InProgress' } });
  guard = { canActivate: jest.fn().mockReturnValue(true) };
  auth = {
    getRequestUserOrClient: jest.fn().mockReturnValue({ id: 'synthetic-user' }),
    authorizeProjectAction: jest.fn().mockResolvedValue({ project: { id: projectId } }),
  };
  builder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([{ value: 'button.save', translations: [{ value: 'Enregistrer' }] }]),
  };
  termRepo = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
  localeRepo = {
    find: jest.fn().mockResolvedValue([{ id: 'synthetic-locale', locale: { code: 'fr', language: 'French' } }]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const module = await Test.createTestingModule({
    controllers: [PushController],
    providers: [
      { provide: AuthorizationService, useValue: auth },
      { provide: getRepositoryToken(Term), useValue: termRepo },
      { provide: getRepositoryToken(ProjectLocale), useValue: localeRepo },
    ],
  }).overrideGuard(AuthGuard()).useValue(guard).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: false, disableErrorMessages: true, whitelist: true }));
  app.useGlobalFilters(new CustomExceptionFilter());
  await app.init();
});

afterEach(async () => {
  await app.close();
  send.mockRestore();
  cloudFront.mockRestore();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

const url = () => '/api/v1/projects/' + projectId + '/push?locale=xx&format=jsonnested&untranslated=false&fallbackLocale=en';

test.each(keys.slice(0, 4))('missing server setting %s is an actionable 503, not an invalid-body 400', async missing => {
  Object.assign(process.env, {
    TR_AWS_S3_REGION: 'us-east-1', TR_AWS_ACCESS_KEY_ID: 'synthetic-key',
    TR_AWS_SECRET_ACCESS_KEY: 'synthetic-secret', TR_AWS_S3_BUCKET: 'synthetic-bucket',
  });
  delete process.env[missing];
  const response = await request(app.getHttpServer()).post(url()).send({}).expect(503);
  expect(response.body).toEqual({ error: { code: 'PushUnavailable', message: PUSH_UNAVAILABLE_MESSAGE } });
  expect(localeRepo.find).not.toHaveBeenCalled();
  expect(termRepo.createQueryBuilder).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(JSON.stringify(response.body)).not.toMatch(/synthetic-key|synthetic-secret|synthetic-bucket/);
});

test('an empty POST body is valid: resources are generated from saved translations and sent to the mocked S3 client', async () => {
  Object.assign(process.env, {
    TR_AWS_S3_REGION: 'us-east-1', TR_AWS_ACCESS_KEY_ID: 'synthetic-key',
    TR_AWS_SECRET_ACCESS_KEY: 'synthetic-secret', TR_AWS_S3_BUCKET: 'synthetic-bucket',
    TR_AWS_S3_KEY_TEMPLATE: 'resource/{id}/{iso}/{iso}.{ext}',
  });
  const response = await request(app.getHttpServer()).post(url()).send({}).expect(200);
  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0][0];
  expect(JSON.parse(String(command.input.Body))).toEqual({ button: { save: 'Enregistrer' } });
  expect(command.input.Key).toBe('resource/' + projectId + '/fr/fr.json');
  expect(builder.andWhere).not.toHaveBeenCalled();
  expect(response.body.message).toBe('Pushed 1 locales to S3');
});

test('invalid query format remains a 400', async () => {
  await request(app.getHttpServer()).post('/api/v1/projects/' + projectId + '/push?locale=xx&format=invalid').send({}).expect(400);
  expect(send).not.toHaveBeenCalled();
});

test('unauthenticated callers receive 401 without project, database or storage access', async () => {
  guard.canActivate.mockImplementation(() => { throw new UnauthorizedException(); });
  await request(app.getHttpServer()).post(url()).send({}).expect(401);
  expect(auth.authorizeProjectAction).not.toHaveBeenCalled();
  expect(localeRepo.find).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(cloudFront).not.toHaveBeenCalled();
});

test('callers without project export permission receive the existing concealed 404', async () => {
  auth.authorizeProjectAction.mockRejectedValue(new ForbiddenException());
  await request(app.getHttpServer()).post(url()).send({}).expect(404);
  expect(localeRepo.find).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

function configureSyntheticStorage() {
  Object.assign(process.env, {
    TR_AWS_S3_REGION: 'eu-west-2', TR_AWS_ACCESS_KEY_ID: 'synthetic-key',
    TR_AWS_SECRET_ACCESS_KEY: 'synthetic-secret', TR_AWS_S3_BUCKET: 'synthetic-bucket',
  });
}

test('S3 failure returns a static 502 without SDK details or automatic application retry', async () => {
  configureSyntheticStorage();
  send.mockRejectedValue(new Error('synthetic-secret signed-request-header private-request-url'));
  const response = await request(app.getHttpServer()).post(url()).send({}).expect(502);
  expect(response.body.error.code).toBe('PushFailed');
  expect(response.body.error.message).toContain('Some files may already have uploaded');
  expect(JSON.stringify(response.body)).not.toMatch(/synthetic-secret|signed-request-header|private-request-url/);
  expect(send).toHaveBeenCalledTimes(1);
  expect(cloudFront).not.toHaveBeenCalled();
});

test('cache invalidation failure distinguishes uploaded files and sanitizes SDK error details', async () => {
  configureSyntheticStorage();
  process.env.TR_AWS_CLOUDFRONT_DISTRIBUTION_ID = 'synthetic-distribution';
  cloudFront.mockRejectedValue(new Error('synthetic-secret private-cloudfront-details'));
  const response = await request(app.getHttpServer()).post(url()).send({}).expect(502);
  expect(response.body.error.code).toBe('PushCacheRefreshFailed');
  expect(response.body.error.message).toContain('Files were uploaded, but cache refresh failed');
  expect(JSON.stringify(response.body)).not.toMatch(/synthetic-secret|private-cloudfront-details/);
  expect(send).toHaveBeenCalledTimes(1);
  expect(cloudFront).toHaveBeenCalledTimes(1);
});
