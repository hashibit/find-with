/**
 * HTTP integration tests — JobsController + SelectorsController
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

// ─── SelectorsController (no auth) ──────────────────────────────────────────

describe('GET /api/v1/config/selectors', () => {
  it('returns selectors payload with cache headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/config/selectors')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=3600');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('sites');
    expect(res.body.sites).toHaveProperty('linkedin.com');
    expect(res.body.sites).toHaveProperty('indeed.com');
  });
});

// ─── JobsController ─────────────────────────────────────────────────────────

describe('GET /api/v1/jobs/radar', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/jobs/radar');
    expect(res.status).toBe(401);
  });

  it('returns radar list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/jobs/radar')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/jobs/capture', () => {
  it('400 when source or sourceUrl missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs/capture')
      .set(AUTH)
      .send({ source: 'linkedin' }); // sourceUrl missing
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  let capturedJobId: string;
  let capturedRadarItemId: string;

  it('captures a job and returns entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs/capture')
      .set(AUTH)
      .send({
        source: 'linkedin',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1234567890',
        sourceJobId: 'li_1234567890',
        capturedText: 'Senior Software Engineer at Acme Corp. Requirements: 5+ years experience.',
      });
    expect(res.status).toBe(201);
    // capture endpoint returns { capture: JobCapture, radarItem: JobRadarItem }
    expect(res.body.capture).toHaveProperty('id');
    capturedJobId = res.body.capture.id;
    capturedRadarItemId = res.body.radarItem.id;
  });

  it('GET /api/v1/jobs/:id returns job', async () => {
    if (!capturedJobId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${capturedJobId}`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', capturedJobId);
  });

  it('PATCH /api/v1/jobs/:id/radar updates status', async () => {
    if (!capturedRadarItemId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${capturedRadarItemId}/radar`)
      .set(AUTH)
      .send({ status: 'ANALYZED' });
    expect(res.status).toBe(200);
  });

  it('PATCH 400 on invalid status enum', async () => {
    if (!capturedRadarItemId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${capturedRadarItemId}/radar`)
      .set(AUTH)
      .send({ status: 'HAUNTED' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});
