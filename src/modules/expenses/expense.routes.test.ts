import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;
const NOW = new Date('2026-10-17T10:00:00Z');
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);
const OBJECT_ID = expect.stringMatching(/^[a-f\d]{24}$/);
const UNKNOWN_ID = '0'.repeat(24);

const vehicleBody = {
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm: 34500,
};

const expenseBody = {
  category: 'third_party_insurance',
  amount: 5850000,
  title: 'تمدید بیمه‌نامه شخص ثالث ۱۲ ماهه ایران',
  referenceNumber: '1403/2480/991234',
  paidAt: '2024-11-17T00:00:00.000Z',
  expiresAt: '2025-11-17T00:00:00.000Z',
  expiryReminder: true,
  paymentMethod: 'online',
  issuer: 'نمایندگی بیمه ایران (کد ۲۴۸۰)',
};

describe('/api/vehicles/:id/expenses', () => {
  let app: ReturnType<typeof createApp>;
  let vehicleId: string;
  let path: string;

  beforeEach(async () => {
    app = createApp(createTestDependencies({ now: () => NOW }));
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', ALICE)
      .send(vehicleBody)
      .expect(201);
    vehicleId = res.body.id;
    path = `/api/vehicles/${vehicleId}/expenses`;
  });

  const post = (body: object, auth = ALICE) =>
    request(app).post(path).set('Authorization', auth).send(body);
  const create = async (body: object = expenseBody) =>
    (await post(body).expect(201)).body.expense.id as string;
  const getVehicle = () =>
    request(app).get(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE);

  it.each([
    ['get', ''],
    ['post', ''],
    ['get', `/${UNKNOWN_ID}`],
    ['patch', `/${UNKNOWN_ID}`],
    ['delete', `/${UNKNOWN_ID}`],
    ['put', `/${UNKNOWN_ID}/attachment`],
    ['get', `/${UNKNOWN_ID}/attachment`],
    ['delete', `/${UNKNOWN_ID}/attachment`],
  ] as const)('%s %s returns 401 without a token', async (method, suffix) => {
    await request(app)[method](path + suffix).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the expense JSON and leaves the mileage unchanged', async () => {
      const res = await post(expenseBody).expect(201);

      expect(res.body).toEqual({
        expense: {
          id: OBJECT_ID,
          vehicleId,
          ...expenseBody,
          attachment: null,
          attachmentUrl: null,
          createdAt: ISO_DATE,
          updatedAt: ISO_DATE,
        },
      });
      expect((await getVehicle()).body.mileageKm).toBe(34500);
    });

    it('sends absent optional fields as null and defaults expiryReminder to true', async () => {
      const res = await post({
        category: 'toll',
        amount: 50000,
        paidAt: expenseBody.paidAt,
      }).expect(201);

      expect(res.body.expense).toMatchObject({
        title: null,
        referenceNumber: null,
        expiresAt: null,
        expiryReminder: true,
        paymentMethod: null,
        issuer: null,
      });
    });

    it.each([
      ['unknown category', { category: 'parking' }, 'category'],
      ['zero amount', { amount: 0 }, 'amount'],
      ['fractional amount', { amount: 1.5 }, 'amount'],
      ['empty title', { title: '  ' }, 'title'],
      ['long title', { title: 'x'.repeat(101) }, 'title'],
      ['long referenceNumber', { referenceNumber: 'x'.repeat(61) }, 'referenceNumber'],
      ['missing paidAt', { paidAt: undefined }, 'paidAt'],
      ['non-ISO paidAt', { paidAt: '17/11/2024' }, 'paidAt'],
      ['non-ISO expiresAt', { expiresAt: 'next year' }, 'expiresAt'],
      ['non-boolean expiryReminder', { expiryReminder: 'yes' }, 'expiryReminder'],
      ['unknown paymentMethod', { paymentMethod: 'cash' }, 'paymentMethod'],
      ['long issuer', { issuer: 'x'.repeat(101) }, 'issuer'],
    ])('returns 400 for %s', async (_name, overrides, field) => {
      const res = await post({ ...expenseBody, ...overrides }).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('returns 400 for a paidAt in the future', async () => {
      const res = await post({
        ...expenseBody,
        paidAt: '2026-10-17T10:01:01Z',
        expiresAt: null,
      }).expect(400);

      expect(res.body.error.details).toEqual({ paidAt: ['Must not be in the future'] });
    });

    it('returns 400 for an expiresAt not after paidAt', async () => {
      const res = await post({ ...expenseBody, expiresAt: expenseBody.paidAt }).expect(400);

      expect(res.body.error.details).toEqual({ expiresAt: ['Must be after paidAt'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const res = await post(expenseBody, BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });

    it('returns 404 for a malformed vehicle id', async () => {
      await request(app)
        .post('/api/vehicles/nope/expenses')
        .set('Authorization', ALICE)
        .send(expenseBody)
        .expect(404);
    });
  });

  describe('GET list', () => {
    it('returns the expenses newest paidAt first', async () => {
      const older = await create({ ...expenseBody, paidAt: '2026-01-01T00:00:00Z', expiresAt: null });
      const newer = await create({ ...expenseBody, paidAt: '2026-09-01T00:00:00Z', expiresAt: null });

      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body.expenses.map((e: { id: string }) => e.id)).toEqual([newer, older]);
    });

    it('returns an empty list for a vehicle without expenses', async () => {
      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body).toEqual({ expenses: [] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(path).set('Authorization', BOB).expect(404);
    });
  });

  describe('GET one', () => {
    it('returns the expense', async () => {
      const id = await create();

      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(200);

      expect(res.body.expense).toMatchObject({ id, vehicleId, amount: 5850000 });
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);

      expect(res.body).toEqual({ error: { message: 'Expense not found' } });
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).get(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('PATCH', () => {
    it('returns 200 with the updated expense', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ amount: 6000000, title: null, paymentMethod: 'pos' })
        .expect(200);

      expect(res.body.expense).toMatchObject({
        id,
        amount: 6000000,
        title: null,
        paymentMethod: 'pos',
        issuer: expenseBody.issuer,
      });
    });

    it('clears the expiry with expiresAt null', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ expiresAt: null })
        .expect(200);

      expect(res.body.expense.expiresAt).toBeNull();
    });

    it('returns 400 when the merged expiresAt is not after paidAt', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ paidAt: '2025-12-01T00:00:00Z' })
        .expect(400);

      expect(res.body.error.details).toEqual({ expiresAt: ['Must be after paidAt'] });
    });

    it('returns 400 for an invalid field', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ amount: 0 })
        .expect(400);

      expect(res.body.error.details).toHaveProperty(['amount']);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ amount: 1 })
        .expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', BOB)
        .send({ amount: 1 })
        .expect(404);
    });
  });

  describe('DELETE', () => {
    it('returns 204 and the expense is gone', async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(204);

      await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('/:expenseId/attachment', () => {
    let expenseId: string;
    const ATTACHMENT_URL =
      /^\/api\/vehicles\/[a-f\d]{24}\/expenses\/[a-f\d]{24}\/attachment\?v=\d+$/;

    beforeEach(async () => {
      expenseId = await create();
    });

    function upload(
      bytes: Buffer,
      contentType = 'application/pdf',
      field = 'attachment',
      auth = ALICE,
    ) {
      return request(app)
        .put(`${path}/${expenseId}/attachment`)
        .set('Authorization', auth)
        .attach(field, bytes, { filename: 'بیمه‌نامه.pdf', contentType });
    }

    function getAttachment() {
      return request(app)
        .get(`${path}/${expenseId}/attachment`)
        .set('Authorization', ALICE)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    }

    it('PUT returns 200 with the expense, its attachment and a versioned attachmentUrl', async () => {
      const res = await upload(PDF_BYTES).expect(200);

      expect(res.body.expense).toMatchObject({
        id: expenseId,
        attachment: {
          fileName: 'بیمه‌نامه.pdf',
          contentType: 'application/pdf',
          sizeBytes: PDF_BYTES.length,
          updatedAt: ISO_DATE,
        },
        attachmentUrl: expect.stringMatching(ATTACHMENT_URL),
      });
    });

    it.each([
      ['JPEG', JPEG_BYTES, 'image/jpeg'],
      ['PNG', PNG_BYTES, 'image/png'],
    ])('PUT accepts a %s image', async (_name, bytes, contentType) => {
      const res = await upload(bytes, contentType).expect(200);

      expect(res.body.expense.attachment.contentType).toBe(contentType);
    });

    it('PUT gives attachmentUrl a new v on replace', async () => {
      const first = await upload(PDF_BYTES).expect(200);

      const second = await upload(JPEG_BYTES, 'image/jpeg').expect(200);

      expect(second.body.expense.attachmentUrl).not.toBe(first.body.expense.attachmentUrl);
    });

    it('PUT returns 400 without a file', async () => {
      const res = await request(app)
        .put(`${path}/${expenseId}/attachment`)
        .set('Authorization', ALICE)
        .expect(400);

      expect(res.body.error.details).toEqual({ attachment: ['Required'] });
    });

    it('PUT returns 400 for a disallowed declared type', async () => {
      const res = await upload(PDF_BYTES, 'image/webp').expect(400);

      expect(res.body.error.details).toEqual({ attachment: ['Must be a PDF, JPEG or PNG file'] });
    });

    it('PUT returns 400 when the bytes are not a PDF or image', async () => {
      const res = await upload(Buffer.from('<?php echo 1; ?>'), 'application/pdf').expect(400);

      expect(res.body.error.details).toEqual({ attachment: ['Must be a PDF, JPEG or PNG file'] });
    });

    it('PUT returns 413 above 10 MB', async () => {
      const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024)]);

      const res = await upload(tooBig).expect(413);

      expect(res.body).toEqual({ error: { message: 'File too large' } });
    });

    it("PUT returns 404 for another user's vehicle", async () => {
      await upload(PDF_BYTES, 'application/pdf', 'attachment', BOB).expect(404);
    });

    it('GET returns the bytes with a long private cache', async () => {
      await upload(PDF_BYTES).expect(200);

      const res = await getAttachment().expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('private, max-age=31536000');
      expect(res.body).toEqual(PDF_BYTES);
    });

    it('GET returns 404 without an attachment', async () => {
      const res = await getAttachment().expect(404);

      expect(JSON.parse(res.body.toString())).toEqual({
        error: { message: 'Attachment not found' },
      });
    });

    it('DELETE returns the expense with attachment null', async () => {
      await upload(PDF_BYTES).expect(200);

      const res = await request(app)
        .delete(`${path}/${expenseId}/attachment`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body.expense).toMatchObject({
        id: expenseId,
        attachment: null,
        attachmentUrl: null,
      });
      await getAttachment().expect(404);
    });

    it('GET list and GET one carry the attachment', async () => {
      const uploaded = await upload(PDF_BYTES).expect(200);

      const list = await request(app).get(path).set('Authorization', ALICE).expect(200);
      const one = await request(app)
        .get(`${path}/${expenseId}`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(list.body.expenses[0]).toEqual(uploaded.body.expense);
      expect(one.body.expense).toEqual(uploaded.body.expense);
    });
  });

  it('deleting the vehicle deletes its expenses', async () => {
    const id = await create();

    await request(app).delete(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE).expect(204);

    await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
  });
});
