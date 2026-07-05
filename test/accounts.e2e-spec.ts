import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/** v0.3: accounts, profile, usage, opt-in history. */
describe('Accounts & history (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const stamp = Date.now();
  const email = `e2e-${stamp}@test.dev`;
  const password = 'super-secret-123';
  const deviceIdentifier = `e2e-acct-${stamp}`;

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

  it('POST /auth/register → account + tokens with user info', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, deviceIdentifier });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.plan).toBe('free');
    token = response.body.accessToken;
  });

  it('POST /auth/register with same email → 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, deviceIdentifier });
    expect(response.status).toBe(409);
  });

  it('POST /auth/login wrong password → 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password', deviceIdentifier });
    expect(response.status).toBe(401);
  });

  it('POST /auth/login → tokens linked to the account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, deviceIdentifier });
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(email);
    token = response.body.accessToken;
  });

  it('GET /users/me → profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.historyOptIn).toBe(false);
  });

  it('GET /usage → summary with limits not enforced (MVP)', async () => {
    const response = await request(app.getHttpServer())
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.plan).toBe('free');
    expect(response.body.enforced).toBe(false);
    expect(typeof response.body.used).toBe('number');
  });

  it('history stays empty while opted out', async () => {
    await request(app.getHttpServer())
      .post('/ai/replies')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Private message', tone: 'funny', intent: 'reply' })
      .expect(201);

    const history = await request(app.getHttpServer())
      .get('/history')
      .set('Authorization', `Bearer ${token}`);
    expect(history.body.entries).toHaveLength(0);
  });

  it('PATCH /users/profile → opt into history', async () => {
    const response = await request(app.getHttpServer())
      .patch('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ historyOptIn: true, displayName: 'E2E Tester' });
    expect(response.status).toBe(200);
    expect(response.body.historyOptIn).toBe(true);
    expect(response.body.displayName).toBe('E2E Tester');
  });

  it('history records generations after opting in', async () => {
    await request(app.getHttpServer())
      .post('/ai/replies')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Remember this one', tone: 'confident', intent: 'reply' })
      .expect(201);

    const history = await request(app.getHttpServer())
      .get('/history')
      .set('Authorization', `Bearer ${token}`);
    expect(history.body.entries).toHaveLength(1);
    expect(history.body.entries[0].message).toBe('Remember this one');
    expect(history.body.entries[0].suggestions).toHaveLength(3);
  });

  it('anonymous device: GET /users/me → { user: null }', async () => {
    const anon = await request(app.getHttpServer())
      .post('/auth/device')
      .send({ deviceIdentifier: `anon-${stamp}`, platform: 'ios' });
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${anon.body.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
  });

  it('anonymous device: PATCH /users/profile → 403', async () => {
    const anon = await request(app.getHttpServer())
      .post('/auth/device')
      .send({ deviceIdentifier: `anon-${stamp}`, platform: 'ios' });
    const response = await request(app.getHttpServer())
      .patch('/users/profile')
      .set('Authorization', `Bearer ${anon.body.accessToken}`)
      .send({ historyOptIn: true });
    expect(response.status).toBe(403);
  });
});
