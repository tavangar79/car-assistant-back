import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppDependencies } from '../../app.ts';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
import { InMemoryDocumentFileRepository } from '../../test/in-memory-document-file.repository.ts';
import { InMemoryNotificationRepository } from '../../test/in-memory-notification.repository.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { inlineDisposition } from './document.routes.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ALICE = `Bearer ${tokens.sign(ALICE_ID)}`;
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

const documentBody = {
  type: 'third_party_insurance',
  issuer: 'بیمه ایران',
  number: '124/987432',
  issuedAt: '2023-12-01T00:00:00.000Z',
  expiresAt: '2024-11-30T00:00:00.000Z',
};

describe('/api/vehicles/:id/documents', () => {
  let deps: AppDependencies;
  let files: InMemoryDocumentFileRepository;
  let notifications: InMemoryNotificationRepository;
  let app: ReturnType<typeof createApp>;
  let vehicleId: string;
  let path: string;

  beforeEach(async () => {
    files = new InMemoryDocumentFileRepository();
    notifications = new InMemoryNotificationRepository();
    deps = createTestDependencies({
      now: () => NOW,
      documentFileRepository: files,
      notificationRepository: notifications,
    });
    app = createApp(deps);
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', ALICE)
      .send(vehicleBody)
      .expect(201);
    vehicleId = res.body.id;
    path = `/api/vehicles/${vehicleId}/documents`;
  });

  const post = (body: object, auth = ALICE) =>
    request(app).post(path).set('Authorization', auth).send(body);
  const create = async (body: object = documentBody) =>
    (await post(body).expect(201)).body.document.id as string;

  function upload(
    documentId: string,
    bytes: Buffer,
    {
      contentType = 'application/pdf',
      field = 'file',
      auth = ALICE,
      filename = 'بیمه‌نامه.pdf',
    } = {},
  ) {
    return request(app)
      .post(`${path}/${documentId}/files`)
      .set('Authorization', auth)
      .attach(field, bytes, { filename, contentType });
  }

  function download(url: string, auth = ALICE) {
    return request(app)
      .get(url)
      .set('Authorization', auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
  }

  it.each([
    ['get', ''],
    ['post', ''],
    ['get', `/${UNKNOWN_ID}`],
    ['patch', `/${UNKNOWN_ID}`],
    ['delete', `/${UNKNOWN_ID}`],
    ['post', `/${UNKNOWN_ID}/files`],
    ['get', `/${UNKNOWN_ID}/files/${UNKNOWN_ID}`],
    ['delete', `/${UNKNOWN_ID}/files/${UNKNOWN_ID}`],
  ] as const)('%s %s returns 401 without a token', async (method, suffix) => {
    const client = request(app);
    await client[method](path + suffix).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the document JSON', async () => {
      const res = await post(documentBody).expect(201);

      expect(res.body).toEqual({
        document: {
          id: OBJECT_ID,
          vehicleId,
          ...documentBody,
          title: null,
          expiryReminder: true,
          notes: null,
          files: [],
          createdAt: ISO_DATE,
          updatedAt: ISO_DATE,
        },
      });
    });

    it('sends absent optional fields as null (a permanent document)', async () => {
      const res = await post({ type: 'green_sheet' }).expect(201);

      expect(res.body.document).toMatchObject({
        title: null,
        issuer: null,
        number: null,
        issuedAt: null,
        expiresAt: null,
        expiryReminder: true,
        notes: null,
      });
    });

    it.each([
      ['missing type', { type: undefined }, 'type'],
      ['unknown type', { type: 'passport' }, 'type'],
      ['long title', { title: 'x'.repeat(101) }, 'title'],
      ['empty title', { title: '  ' }, 'title'],
      ['long issuer', { issuer: 'x'.repeat(101) }, 'issuer'],
      ['long number', { number: 'x'.repeat(51) }, 'number'],
      ['long notes', { notes: 'x'.repeat(501) }, 'notes'],
      ['non-ISO issuedAt', { issuedAt: '01/12/2023' }, 'issuedAt'],
      ['non-ISO expiresAt', { expiresAt: 'next year' }, 'expiresAt'],
      ['non-boolean expiryReminder', { expiryReminder: 'yes' }, 'expiryReminder'],
    ])('returns 400 for %s', async (_name, overrides, field) => {
      const res = await post({ ...documentBody, ...overrides }).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('returns 400 for an expiresAt not after issuedAt', async () => {
      const res = await post({ ...documentBody, expiresAt: documentBody.issuedAt }).expect(400);

      expect(res.body.error.details).toEqual({ expiresAt: ['Must be after issuedAt'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const res = await post(documentBody, BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });

    it('returns 404 for a malformed vehicle id', async () => {
      await request(app)
        .post('/api/vehicles/nope/documents')
        .set('Authorization', ALICE)
        .send(documentBody)
        .expect(404);
    });
  });

  describe('GET list', () => {
    it('returns expiring soonest first, then permanent ones', async () => {
      const permanent = await create({ type: 'vehicle_card' });
      const later = await create({ ...documentBody, expiresAt: '2027-01-01T00:00:00Z' });
      const sooner = await create({ ...documentBody, expiresAt: '2026-11-01T00:00:00Z' });

      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([
        sooner,
        later,
        permanent,
      ]);
    });

    it('returns an empty list for a vehicle without documents', async () => {
      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body).toEqual({ documents: [] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(path).set('Authorization', BOB).expect(404);
    });
  });

  describe('GET one', () => {
    it('returns the document', async () => {
      const id = await create();

      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(200);

      expect(res.body.document).toMatchObject({ id, vehicleId, number: '124/987432' });
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);

      expect(res.body).toEqual({ error: { message: 'Document not found' } });
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).get(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('PATCH', () => {
    it('returns 200 with the updated document; null clears a field', async () => {
      const id = await create({ ...documentBody, title: 'قدیمی' });

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ title: null, expiresAt: null, expiryReminder: false, notes: 'تمدید شد' })
        .expect(200);

      expect(res.body.document).toMatchObject({
        id,
        title: null,
        issuer: documentBody.issuer,
        expiresAt: null,
        expiryReminder: false,
        notes: 'تمدید شد',
      });
    });

    it('returns 400 when the merged expiresAt is not after issuedAt', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ issuedAt: '2025-01-01T00:00:00Z' })
        .expect(400);

      expect(res.body.error.details).toEqual({ expiresAt: ['Must be after issuedAt'] });
    });

    it('returns 400 for an invalid field', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ type: 'passport' })
        .expect(400);

      expect(res.body.error.details).toHaveProperty(['type']);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ number: '1' })
        .expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', BOB)
        .send({ number: '1' })
        .expect(404);
    });
  });

  describe('DELETE', () => {
    it('returns 204 and deletes the document, its files and its notifications', async () => {
      const id = await create();
      await upload(id, PDF_BYTES).expect(201);
      await notifications.createMany([
        {
          userId: ALICE_ID,
          key: `document:${id}`,
          kind: 'document_expiry',
          vehicleId,
          refId: id,
          subject: 'بیمه شخص ثالث',
          dueKm: null,
          remainingKm: null,
          mileageKm: null,
          expiresAt: NOW,
          thresholdDays: 7,
          createdAt: NOW,
        },
      ]);

      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(204);

      await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
      expect(files.files.size).toBe(0);
      expect(notifications.notifications.size).toBe(0);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('/:documentId/files', () => {
    let documentId: string;

    beforeEach(async () => {
      documentId = await create();
    });

    it('POST returns 201 with the document and its file', async () => {
      const res = await upload(documentId, PDF_BYTES).expect(201);

      expect(res.body.document).toMatchObject({
        id: documentId,
        files: [
          {
            id: OBJECT_ID,
            fileName: 'بیمه‌نامه.pdf',
            contentType: 'application/pdf',
            sizeBytes: PDF_BYTES.length,
            createdAt: ISO_DATE,
            url: `${path}/${documentId}/files/${res.body.document.files[0].id}`,
          },
        ],
      });
    });

    it('round-trips the bytes, which are encrypted at rest', async () => {
      const res = await upload(documentId, JPEG_BYTES, {
        contentType: 'image/jpeg',
        filename: 'کارت (جلو).jpg',
      }).expect(201);
      const [file] = res.body.document.files;

      const downloaded = await download(file.url).expect(200);

      expect(downloaded.body).toEqual(JPEG_BYTES);
      expect(downloaded.headers['content-type']).toBe('image/jpeg');
      expect(downloaded.headers['content-disposition']).toBe(inlineDisposition('کارت (جلو).jpg'));
      expect(downloaded.headers['cache-control']).toBe('private, max-age=31536000');
      const stored = Buffer.from([...files.files.values()][0]!.data);
      expect(stored.includes(JPEG_BYTES)).toBe(false);
    });

    it('lists the files oldest first on GET one and GET list', async () => {
      await upload(documentId, PNG_BYTES, { contentType: 'image/png', filename: 'front.png' });
      await upload(documentId, PNG_BYTES, { contentType: 'image/png', filename: 'back.png' });

      const one = await request(app)
        .get(`${path}/${documentId}`)
        .set('Authorization', ALICE)
        .expect(200);
      const list = await request(app).get(path).set('Authorization', ALICE).expect(200);

      const names = (body: { files: { fileName: string }[] }) => body.files.map((f) => f.fileName);
      expect(names(one.body.document)).toEqual(['front.png', 'back.png']);
      expect(list.body.documents[0]).toEqual(one.body.document);
    });

    it('returns 422 for a 5th file', async () => {
      for (let i = 0; i < 4; i++) await upload(documentId, PDF_BYTES).expect(201);

      const res = await upload(documentId, PDF_BYTES).expect(422);

      expect(res.body.error.details).toEqual({
        file: ['A document can have at most 4 files'],
      });
      expect(files.files.size).toBe(4);
    });

    it('returns 400 without a file', async () => {
      const res = await request(app)
        .post(`${path}/${documentId}/files`)
        .set('Authorization', ALICE)
        .expect(400);

      expect(res.body.error.details).toEqual({ file: ['Required'] });
    });

    it('returns 400 for a disallowed declared type', async () => {
      const res = await upload(documentId, PDF_BYTES, { contentType: 'image/webp' }).expect(400);

      expect(res.body.error.details).toEqual({ file: ['Must be a PDF, JPEG or PNG file'] });
    });

    it('returns 400 when the bytes are not a PDF or image', async () => {
      const res = await upload(documentId, Buffer.from('<?php echo 1; ?>')).expect(400);

      expect(res.body.error.details).toEqual({ file: ['Must be a PDF, JPEG or PNG file'] });
    });

    it('returns 413 above 10 MB', async () => {
      const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024)]);

      const res = await upload(documentId, tooBig).expect(413);

      expect(res.body).toEqual({ error: { message: 'File too large' } });
    });

    it("returns 404 for another user's vehicle", async () => {
      await upload(documentId, PDF_BYTES, { auth: BOB }).expect(404);
    });

    it('DELETE returns 200 with the document without the file', async () => {
      const res = await upload(documentId, PDF_BYTES).expect(201);
      const [file] = res.body.document.files;

      const deleted = await request(app).delete(file.url).set('Authorization', ALICE).expect(200);

      expect(deleted.body.document).toMatchObject({ id: documentId, files: [] });
      await download(file.url).expect(404);
    });

    it.each(['nope', UNKNOWN_ID])('GET and DELETE return 404 for file id %s', async (fileId) => {
      const url = `${path}/${documentId}/files/${fileId}`;

      const res = await download(url).expect(404);
      await request(app).delete(url).set('Authorization', ALICE).expect(404);

      expect(JSON.parse(res.body.toString())).toEqual({ error: { message: 'File not found' } });
    });

    it("GET returns 404 for another user's vehicle", async () => {
      const res = await upload(documentId, PDF_BYTES).expect(201);

      await download(res.body.document.files[0].url, BOB).expect(404);
    });
  });

  it('deleting the vehicle deletes its documents and files', async () => {
    const id = await create();
    await upload(id, PDF_BYTES).expect(201);

    await request(app).delete(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE).expect(204);

    expect(await deps.documentRepository.countByVehicles([vehicleId])).toBe(0);
    expect(files.files.size).toBe(0);
  });
});

describe('inlineDisposition', () => {
  it('encodes non-ASCII and RFC 5987 reserved characters', () => {
    expect(inlineDisposition("کارت (جلو)'s*.pdf")).toBe(
      "inline; filename*=UTF-8''%DA%A9%D8%A7%D8%B1%D8%AA%20%28%D8%AC%D9%84%D9%88%29%27s%2A.pdf",
    );
  });
});
