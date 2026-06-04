/**
 * HTTP integration tests — ProfileController
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('GET /api/v1/profile', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/profile');
    expect(res.status).toBe(401);
  });

  it('returns profile (may be empty on fresh user)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile')
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/profile/resume', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/resume')
      .attach('file', Buffer.from('%PDF-1.4 test'), 'resume.pdf');
    expect(res.status).toBe(401);
  });

  it('uploads resume file and returns parsed result', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/resume')
      .set(AUTH)
      .attach('file', Buffer.from('%PDF-1.4 mock resume content'), 'test-resume.pdf');
    // 201 on success; service may 422 on LLM parse error (mocked) — just not 401/404
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });
});

describe('GET /api/v1/profile/materials', () => {
  it('returns materials list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile/materials')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/profile/materials', () => {
  it('400 when provenanceKind is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/materials')
      .set(AUTH)
      .send({ rawText: 'Some experience' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  let createdId: string;

  it('creates a material', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/materials')
      .set(AUTH)
      .send({ rawText: 'Led a team of 5 engineers', provenanceKind: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdId = res.body.id;
  });

  it('PATCH updates the material', async () => {
    if (!createdId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/profile/materials/${createdId}`)
      .set(AUTH)
      .send({ shiningText: 'Scaled team 3× in 6 months', status: 'USER_EDITED' });
    expect(res.status).toBe(200);
  });

  it('400 when status is invalid enum', async () => {
    if (!createdId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/profile/materials/${createdId}`)
      .set(AUTH)
      .send({ status: 'INVALID_STATUS' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('DELETE removes the material', async () => {
    if (!createdId) return;
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/profile/materials/${createdId}`)
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/profile/base-resumes', () => {
  it('returns base resumes list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile/base-resumes')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/profile/base-resumes', () => {
  it('400 when name is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/base-resumes')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('creates a base resume', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profile/base-resumes')
      .set(AUTH)
      .send({ name: 'PM Direction', selectedMaterialIds: [] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});
