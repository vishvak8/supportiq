import {
  beforeAll,
  beforeEach,
  afterAll,
  test,
  expect,
  jest,
} from '@jest/globals';
import { config } from 'dotenv';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
config({ quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  !new URL(testUrl).pathname.endsWith('_test') ||
  new URL(testUrl).pathname ===
    new URL(process.env.DATABASE_URL || 'postgresql://localhost/unconfigured')
      .pathname
)
  throw new Error('Use a separate TEST_DATABASE_URL ending in _test');
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.CSRF_SECRET ||=
  'test-only-csrf-secret-with-more-than-32-characters';
const { createApp } = await import('../dist/app.js');
const { Database } = await import('../dist/database.js');
const { passwordHash } = await import('../dist/auth.js');
const { digest } = await import('../dist/security.js');
let app,
  db,
  server,
  org1,
  org2,
  alice,
  bob,
  foreign,
  admin,
  aliceTicket,
  foreignTicket;
const password = 'Synthetic-test-password!42';
async function client(email) {
  const agent = request.agent(server);
  const csrf = await agent.get('/auth/csrf');
  const post = (path, body) =>
    agent
      .post(path)
      .set('Origin', process.env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf.body.token)
      .send(body);
  if (email) {
    const result = await post('/auth/login', { email, password });
    expect(result.status).toBe(201);
  }
  return { agent, post, token: csrf.body.token };
}
beforeAll(async () => {
  app = await createApp();
  db = app.get(Database);
  server = app.getHttpServer();
  await db.$executeRawUnsafe(
    'TRUNCATE "Organisation", "User", "RateLimit" CASCADE',
  );
  org1 = await db.organisation.create({ data: { name: 'Tenant One' } });
  org2 = await db.organisation.create({ data: { name: 'Tenant Two' } });
  const hashed = await passwordHash(password);
  async function member(email, organisationId, role = 'CUSTOMER') {
    const user = await db.user.create({
      data: { email, name: email.split('@')[0], passwordHash: hashed },
    });
    return db.membership.create({
      data: { userId: user.id, organisationId, role },
      include: { user: true },
    });
  }
  alice = await member('alice@test.example', org1.id);
  bob = await member('bob@test.example', org1.id);
  foreign = await member('foreign@test.example', org2.id);
  admin = await member('admin@test.example', org1.id, 'ADMINISTRATOR');
  async function ticket(m) {
    return db.ticket.create({
      data: {
        customerId: m.id,
        organisationId: m.organisationId,
        subject: 'A real persisted request',
        description: 'Only the owner should see this request.',
        requestId: randomUUID(),
        messages: {
          create: [
            { authorId: m.id, body: 'Public request' },
            { authorId: m.id, body: 'SECRET INTERNAL NOTE', internal: true },
          ],
        },
        events: { create: { actorId: m.id, kind: 'PRIVATE_INTERNAL_EVENT' } },
      },
    });
  }
  aliceTicket = await ticket(alice);
  foreignTicket = await ticket(foreign);
});
beforeEach(async () => {
  await db.rateLimit.deleteMany();
});
afterAll(async () => {
  await app?.close();
});
test('registration atomically creates user, organisation and administrator; passwords and session tokens are hashed', async () => {
  const c = await client();
  const response = await c.post('/auth/register', {
    name: 'New Admin',
    email: 'NEW@TEST.EXAMPLE',
    password,
    organisation: 'Registered Org',
  });
  expect(response.status).toBe(201);
  expect(response.body.email).toBe('new@test.example');
  expect(response.body.memberships[0].role).toBe('ADMINISTRATOR');
  expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  const user = await db.user.findUnique({
    where: { email: 'new@test.example' },
  });
  expect(user.passwordHash).toMatch(/^\$argon2id/);
  const raw = response.headers['set-cookie']
    .find((v) => v.startsWith('siq_session='))
    .split(';')[0]
    .split('=')[1];
  const s = await db.session.findUnique({ where: { tokenHash: digest(raw) } });
  expect(s.userId).toBe(user.id);
  expect(s.tokenHash).not.toBe(raw);
  expect(response.headers['set-cookie'].join()).toContain('HttpOnly');
  expect((await c.agent.get('/auth/me')).status).toBe(200);
});
test('duplicate registration leaves no orphan organisation', async () => {
  const c = await client();
  const n = await db.organisation.count();
  expect(
    (
      await c.post('/auth/register', {
        name: 'Duplicate',
        email: alice.user.email,
        password,
        organisation: 'Orphan',
      })
    ).status,
  ).toBe(409);
  expect(await db.organisation.count()).toBe(n);
});
test('rejects role injection and unknown DTO fields', async () => {
  const c = await client();
  expect(
    (
      await c.post('/auth/register', {
        name: 'Attacker',
        email: 'bad@test.example',
        password,
        organisation: 'Bad',
        role: 'ADMINISTRATOR',
      })
    ).status,
  ).toBe(400);
});
test('bad login and unauthenticated access fail', async () => {
  const c = await client();
  expect(
    (
      await c.post('/auth/login', {
        email: alice.user.email,
        password: 'wrong-password-123',
      })
    ).status,
  ).toBe(401);
  expect((await c.agent.get('/auth/me')).status).toBe(401);
  expect((await c.agent.get(`/organisations/${org1.id}/tickets`)).status).toBe(
    401,
  );
});
test('logout revokes the persisted session and replayed cookie', async () => {
  const c = await client();
  const login = await c.post('/auth/login', {
    email: alice.user.email,
    password,
  });
  const cookie = login.headers['set-cookie']
    .find((v) => v.startsWith('siq_session='))
    .split(';')[0];
  expect((await c.post('/auth/logout', {})).status).toBe(201);
  expect(
    (await request(server).get('/auth/me').set('Cookie', cookie)).status,
  ).toBe(401);
});
test('expired sessions are rejected', async () => {
  const c = await client(bob.user.email);
  await db.session.updateMany({
    where: { userId: bob.userId },
    data: { expiresAt: new Date(0) },
  });
  expect((await c.agent.get('/auth/me')).status).toBe(401);
});
test('CSRF rejects missing token, forged signature and foreign Origin', async () => {
  const c = await client();
  expect(
    (
      await c.agent
        .post('/auth/logout')
        .set('Origin', process.env.APP_ORIGIN)
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await c.agent
        .post('/auth/logout')
        .set('Origin', 'https://evil.example')
        .set('X-CSRF-Token', c.token)
        .send({})
    ).status,
  ).toBe(403);
  const forged = 'a'.repeat(64) + '.' + 'b'.repeat(64);
  expect(
    (
      await request(server)
        .post('/auth/logout')
        .set('Origin', process.env.APP_ORIGIN)
        .set('Cookie', 'siq_csrf=' + forged)
        .set('X-CSRF-Token', forged)
        .send({})
    ).status,
  ).toBe(403);
});
test('login attempts are limited in PostgreSQL', async () => {
  const c = await client();
  for (let i = 0; i < 12; i++)
    expect(
      (
        await c.post('/auth/login', {
          email: alice.user.email,
          password: 'wrong-password-123',
        })
      ).status,
    ).toBe(401);
  expect(
    (await c.post('/auth/login', { email: alice.user.email, password })).status,
  ).toBe(429);
});
test('customer creates a persisted ticket, public message and history with safe retries', async () => {
  const c = await client(alice.user.email);
  const input = {
    subject: 'Help with my account',
    description: 'Please help me update my address.',
    priority: 'HIGH',
    requestId: randomUUID(),
  };
  const path = `/organisations/${org1.id}/tickets`;
  const one = await c.post(path, input);
  expect(one.status).toBe(201);
  const two = await c.post(path, input);
  expect(two.body.id).toBe(one.body.id);
  expect(await db.message.count({ where: { ticketId: one.body.id } })).toBe(1);
  expect(await db.ticketEvent.count({ where: { ticketId: one.body.id } })).toBe(
    1,
  );
  expect(
    (await c.post(path, { ...input, subject: 'Different request' })).status,
  ).toBe(409);
});
test('customer list contains only own tickets with no internal data', async () => {
  const c = await client(bob.user.email);
  const response = await c.agent.get(`/organisations/${org1.id}/tickets`);
  expect(response.status).toBe(200);
  expect(response.body.total).toBe(0);
  expect(JSON.stringify(response.body)).not.toContain('SECRET');
});
test('direct ticket identifier attacks cannot access another customer or tenant', async () => {
  const c = await client(bob.user.email);
  expect(
    (await c.agent.get(`/organisations/${org1.id}/tickets/${aliceTicket.id}`))
      .status,
  ).toBe(404);
  expect(
    (await c.agent.get(`/organisations/${org1.id}/tickets/${foreignTicket.id}`))
      .status,
  ).toBe(404);
  expect(
    (await c.agent.get(`/organisations/${org2.id}/tickets/${foreignTicket.id}`))
      .status,
  ).toBe(403);
  expect((await c.agent.get(`/organisations/${org2.id}/tickets`)).status).toBe(
    403,
  );
  expect(
    (
      await c.post(`/organisations/${org2.id}/tickets`, {
        subject: 'Cross tenant',
        description: 'This must be rejected.',
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(403);
});
test('detail projections exclude notes, private history and database fields', async () => {
  const c = await client(alice.user.email);
  const response = await c.agent.get(
    `/organisations/${org1.id}/tickets/${aliceTicket.id}`,
  );
  expect(response.status).toBe(200);
  expect(response.body.messages).toHaveLength(1);
  expect(response.body.messages[0].body).toBe('Public request');
  const text = JSON.stringify(response.body);
  for (const forbidden of [
    'SECRET',
    'INTERNAL',
    'events',
    'passwordHash',
    'customerId',
    'organisationId',
    'authorId',
  ])
    expect(text).not.toContain(forbidden);
});
test('pagination, sort, filter and search are bounded and allowlisted', async () => {
  const c = await client(alice.user.email);
  const path = `/organisations/${org1.id}/tickets`;
  expect((await c.agent.get(path + '?pageSize=999')).status).toBe(400);
  expect((await c.agent.get(path + '?sort=passwordHash')).status).toBe(400);
  expect((await c.agent.get(path + '?customerId=' + bob.id)).status).toBe(400);
  const result = await c.agent.get(
    path + '?pageSize=1&search=persisted&status=OPEN&sort=oldest',
  );
  expect(result.status).toBe(200);
  expect(result.body.items).toHaveLength(1);
  expect(result.body.items[0].id).toBe(aliceTicket.id);
});
test('ticket mass assignment and staff creation are rejected', async () => {
  const c = await client(alice.user.email);
  const input = {
    subject: 'Mass assignment',
    description: 'A malicious ticket update',
    requestId: randomUUID(),
    customerId: bob.id,
    status: 'CLOSED',
  };
  expect(
    (await c.post(`/organisations/${org1.id}/tickets`, input)).status,
  ).toBe(400);
  const a = await client(admin.user.email);
  delete input.customerId;
  delete input.status;
  expect(
    (await a.post(`/organisations/${org1.id}/tickets`, input)).status,
  ).toBe(403);
});
test('database composite foreign keys reject cross-organisation relationships', async () => {
  await expect(
    db.ticket.create({
      data: {
        organisationId: org2.id,
        customerId: alice.id,
        subject: 'Invalid relationship',
        description: 'Rejected by the database.',
        requestId: randomUUID(),
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.message.create({
      data: {
        organisationId: org2.id,
        ticketId: aliceTicket.id,
        authorId: foreign.id,
        body: 'Cross tenant message',
      },
    }),
  ).rejects.toThrow();
});
test('only same-organisation administrators can create or list customer links', async () => {
  const c = await client(alice.user.email);
  expect(
    (await c.post(`/organisations/${org1.id}/customer-links`, {})).status,
  ).toBe(403);
  expect(
    (await c.agent.get(`/organisations/${org1.id}/customer-links`)).status,
  ).toBe(403);
  const a = await client(admin.user.email);
  expect(
    (await a.post(`/organisations/${org2.id}/customer-links`, {})).status,
  ).toBe(403);
});
async function link() {
  const a = await client(admin.user.email);
  const response = await a.post(`/organisations/${org1.id}/customer-links`, {});
  expect(response.status).toBe(201);
  return response.body.url.split('#')[1];
}
test('customer link is single-use, hashed and cannot select a role', async () => {
  const raw = await link();
  const c = await client();
  const input = {
    name: 'Joined Customer',
    email: 'joined@test.example',
    password,
    token: raw,
  };
  expect(
    (await c.post('/auth/join', { ...input, role: 'ADMINISTRATOR' })).status,
  ).toBe(400);
  const response = await c.post('/auth/join', input);
  expect(response.status).toBe(201);
  expect(response.body.memberships[0].role).toBe('CUSTOMER');
  expect(response.body.memberships[0].organisation.id).toBe(org1.id);
  expect(
    (await c.post('/auth/join', { ...input, email: 'reuse@test.example' }))
      .status,
  ).toBe(400);
  const stored = await db.customerAccessLink.findUnique({
    where: { tokenHash: digest(raw) },
  });
  expect(stored.usedAt).not.toBeNull();
});
test('expired and fabricated customer tokens reveal no organisation information', async () => {
  const raw = await link();
  await db.customerAccessLink.update({
    where: { tokenHash: digest(raw) },
    data: { expiresAt: new Date(0) },
  });
  const c = await client();
  for (const token of [raw, 'f'.repeat(64)]) {
    const response = await c.post('/auth/join', {
      name: 'Expired',
      email: 'expired@test.example',
      password,
      token,
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(org1.name);
  }
});
test('concurrent customer link claims create only one membership', async () => {
  const raw = await link();
  const a = await client(),
    b = await client();
  const values = await Promise.all([
    a.post('/auth/join', {
      name: 'Race A',
      email: 'race-a@test.example',
      password,
      token: raw,
    }),
    b.post('/auth/join', {
      name: 'Race B',
      email: 'race-b@test.example',
      password,
      token: raw,
    }),
  ]);
  expect(values.map((v) => v.status).sort()).toEqual([201, 400]);
});
test('existing user can join a second organisation without role escalation', async () => {
  const raw = await link();
  const c = await client(foreign.user.email);
  const result = await c.post('/auth/join-existing', { token: raw });
  expect(result.status).toBe(201);
  expect(result.body.memberships).toHaveLength(2);
  expect(
    result.body.memberships.find((m) => m.organisation.id === org1.id).role,
  ).toBe('CUSTOMER');
});
test('revoked membership immediately blocks existing session access', async () => {
  const user = await db.user.create({
    data: {
      name: 'Revoked',
      email: 'revoked@test.example',
      passwordHash: await passwordHash(password),
      memberships: { create: { organisationId: org1.id, role: 'CUSTOMER' } },
    },
  });
  const c = await client(user.email);
  await db.membership.deleteMany({ where: { userId: user.id } });
  expect((await c.agent.get(`/organisations/${org1.id}/tickets`)).status).toBe(
    403,
  );
});
test('removed session is rejected and health/readiness work', async () => {
  const c = await client(bob.user.email);
  await db.session.deleteMany({ where: { userId: bob.userId } });
  expect((await c.agent.get('/auth/me')).status).toBe(401);
  expect((await c.agent.get('/health/live')).status).toBe(200);
  expect((await c.agent.get('/health/ready')).status).toBe(200);
});

test('production session and CSRF cookies use secure host-only attributes', async () => {
  const previousMode = process.env.NODE_ENV,
    previousOrigin = process.env.APP_ORIGIN;
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://support.example';
    const csrf = await request(server).get('/auth/csrf');
    const cookie = csrf.headers['set-cookie'][0];
    expect(cookie).toContain('__Host-siq_csrf=');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Domain=');
    const response = await request(server)
      .post('/auth/login')
      .set('Origin', 'https://support.example')
      .set('Cookie', cookie.split(';')[0])
      .set('X-CSRF-Token', csrf.body.token)
      .send({ email: alice.user.email, password });
    expect(response.status).toBe(201);
    const session = response.headers['set-cookie'][0];
    expect(session).toContain('__Host-siq_session=');
    expect(session).toContain('Secure');
    expect(session).toContain('HttpOnly');
    expect(session).not.toContain('Domain=');
  } finally {
    process.env.NODE_ENV = previousMode;
    process.env.APP_ORIGIN = previousOrigin;
  }
});
test('readiness reports dependency failure without exposing database error details', async () => {
  const query = jest
    .spyOn(db, '$queryRaw')
    .mockRejectedValueOnce(new Error('private database connection detail'));
  try {
    const response = await request(server).get('/health/ready');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private database');
    expect(response.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    query.mockRestore();
  }
});
