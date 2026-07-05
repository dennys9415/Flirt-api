import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * End-to-end tests against real Postgres + Redis (docker) with the fake AI
 * provider. Locally: start the infra first (Flirt-infra/scripts/up.sh).
 * In CI: service containers + SQL migrations (see .github/workflows/ci.yml).
 */
describe('Flirt API (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const deviceIdentifier = `e2e-${Date.now()}`;

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'fake';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → ok', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('POST /auth/device → issues a token pair', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/device')
      .send({ deviceIdentifier, platform: 'ios' });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.deviceId).toBeDefined();
    accessToken = response.body.accessToken;
  });

  it('POST /auth/device → same identifier maps to same device', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/device')
      .send({ deviceIdentifier, platform: 'ios' });
    const second = await request(app.getHttpServer())
      .post('/auth/device')
      .send({ deviceIdentifier, platform: 'ios' });
    expect(first.body.deviceId).toBe(second.body.deviceId);
  });

  it('POST /ai/replies without token → 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/replies')
      .send({ message: 'Hi', tone: 'funny', intent: 'reply' });
    expect(response.status).toBe(401);
  });

  it('POST /ai/replies → 3 structured suggestions (fake provider)', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/replies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        message: 'Hey, how was your weekend?',
        tone: 'light_flirt',
        intent: 'reply',
        context: { appHint: 'tinder' },
      });

    expect(response.status).toBe(201);
    expect(response.body.suggestions).toHaveLength(3);
    expect(response.body.provider).toBe('fake');
    expect(response.body.tone).toBe('light_flirt');
    for (const suggestion of response.body.suggestions) {
      expect(typeof suggestion.text).toBe('string');
      expect(suggestion.text.length).toBeGreaterThan(0);
    }
  });

  it('POST /ai/replies with invalid tone → 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/replies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ message: 'Hi', tone: 'sarcastic', intent: 'reply' });
    expect(response.status).toBe(400);
  });

  it('POST /ai/replies with unknown extra fields → 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/replies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ message: 'Hi', tone: 'funny', intent: 'reply', hack: true });
    expect(response.status).toBe(400);
  });

  it('POST /ai/refine → refined text', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/refine')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ text: 'A long reply here', action: 'shorter' });

    expect(response.status).toBe(201);
    expect(response.body.text).toContain('shorter');
  });

  it('POST /auth/refresh with garbage → 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'garbage' });
    expect(response.status).toBe(401);
  });
});
