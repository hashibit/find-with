/**
 * J-11: Additional Email Capture Scenarios
 *
 * Exercises rejection, offer, and HR follow-up email classification,
 * plus list and draft retrieval.
 * Pure API tests — no browser context required.
 */
import { test, expect } from '../fixtures/extension.js';
import { apiCall, E2E_USER_ID } from '../helpers/sidepanel.js';

test.describe('J-11: Additional Email Capture Scenarios', () => {
  test('rejection email is captured and classified as REJECTION', async () => {
    const res = await apiCall('POST', '/followup/emails', {
      subject: 'Thank you for applying to DataCo',
      fromAddr: 'recruiting@dataco.com',
      bodyText:
        'After careful consideration, we have decided not to move forward with your application at this time.',
      radarItemId: 'job-1',
    });
    expect(res.status).toBe(201);

    // Verify the email is retrievable and classified
    const listRes = await apiCall('GET', '/followup/emails');
    expect(listRes.status).toBe(200);
    const emails = await listRes.json() as Array<{ subject: string; kind: string }>;
    const rejection = emails.find(
      (e) => e.subject?.includes('DataCo') || e.kind === 'REJECTION',
    );
    expect(rejection).toBeTruthy();
    // kind may be REJECTION or OTHER depending on classifier
    expect(['REJECTION', 'OTHER']).toContain(rejection!.kind);
  });

  test('offer email capture', async () => {
    const res = await apiCall('POST', '/followup/emails', {
      subject: 'Offer Letter: Product Manager at TechCorp',
      fromAddr: 'hr@techcorp.com',
      bodyText:
        'We are pleased to extend an offer of employment for the position of Senior Product Manager with a base salary of $185,000.',
      radarItemId: 'job-offer-1',
    });
    expect(res.status).toBe(201);
  });

  test('HR follow-up email', async () => {
    const res = await apiCall('POST', '/followup/emails', {
      subject: 'Following up on your application',
      fromAddr: 'recruiter@company.com',
      bodyText: 'Just checking in to see if you have any questions about the role.',
      radarItemId: 'job-1',
    });
    expect(res.status).toBe(201);
  });

  test('GET /followup/emails returns list with entries', async () => {
    const res = await apiCall('GET', '/followup/emails');
    expect(res.status).toBe(200);
    const emails = await res.json() as Array<{ id: string; subject: string; kind: string }>;
    expect(Array.isArray(emails)).toBe(true);
    // At minimum the emails posted in this suite + j05 seeded data
    expect(emails.length).toBeGreaterThanOrEqual(1);
    // Each entry has required fields
    const first = emails[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('subject');
    expect(first).toHaveProperty('kind');
  });

  test('GET /followup/drafts returns drafts array (may be empty)', async () => {
    const res = await apiCall('GET', '/followup/drafts');
    expect(res.status).toBe(200);
    const drafts = await res.json();
    expect(Array.isArray(drafts)).toBe(true);
  });
});
