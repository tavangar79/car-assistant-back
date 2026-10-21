import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { JPEG_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
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

const visitBody = {
  serviceDate: '2026-10-10T08:00:00.000Z',
  odometerKm: 34850,
  workshop: 'اتوسرویس البرز',
  lineItems: [
    {
      itemId: 'engine_oil',
      brand: 'بهران رانا 5W-40',
      cost: 1850000,
      nextDueKm: 7000,
      nextDueMonths: 6,
    },
    { itemId: 'oil_filter', brand: 'سرکان', cost: 280000 },
  ],
};

describe('/api/vehicles/:id/services', () => {
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
    path = `/api/vehicles/${vehicleId}/services`;
  });

  const post = (body: object, auth = ALICE) =>
    request(app).post(path).set('Authorization', auth).send(body);
  const create = async () => (await post(visitBody).expect(201)).body.service.id as string;
  const getVehicle = () =>
    request(app).get(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE);

  it.each([
    ['get', ''],
    ['post', ''],
    ['get', `/${UNKNOWN_ID}`],
    ['patch', `/${UNKNOWN_ID}`],
    ['delete', `/${UNKNOWN_ID}`],
    ['put', `/${UNKNOWN_ID}/invoice`],
    ['get', `/${UNKNOWN_ID}/invoice`],
    ['delete', `/${UNKNOWN_ID}/invoice`],
  ] as const)('%s %s returns 401 without a token', async (method, suffix) => {
    const agent = request(app);
    await agent[method](path + suffix).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the service JSON and raises the vehicle mileage', async () => {
      const res = await post(visitBody).expect(201);

      expect(res.body).toEqual({
        service: {
          id: OBJECT_ID,
          vehicleId,
          serviceDate: '2026-10-10T08:00:00.000Z',
          odometerKm: 34850,
          workshop: 'اتوسرویس البرز',
          notes: null,
          lineItems: [
            {
              itemId: 'engine_oil',
              brand: 'بهران رانا 5W-40',
              cost: 1850000,
              notes: null,
              nextDueKm: 7000,
              nextDueMonths: 6,
            },
            {
              itemId: 'oil_filter',
              brand: 'سرکان',
              cost: 280000,
              notes: null,
              nextDueKm: null,
              nextDueMonths: null,
            },
          ],
          totalCost: 2130000,
          invoice: null,
          invoiceUrl: null,
          createdAt: ISO_DATE,
          updatedAt: ISO_DATE,
        },
      });
      expect((await getVehicle()).body.mileageKm).toBe(34850);
    });

    it('leaves the mileage unchanged for a back-dated visit with a lower odometer', async () => {
      await post({ ...visitBody, odometerKm: 30000 }).expect(201);

      expect((await getVehicle()).body.mileageKm).toBe(34500);
    });

    it.each([
      ['missing serviceDate', { serviceDate: undefined }, 'serviceDate'],
      ['non-ISO serviceDate', { serviceDate: '10/10/2026' }, 'serviceDate'],
      ['negative odometerKm', { odometerKm: -1 }, 'odometerKm'],
      ['fractional odometerKm', { odometerKm: 1.5 }, 'odometerKm'],
      ['empty workshop', { workshop: '  ' }, 'workshop'],
      ['long workshop', { workshop: 'x'.repeat(101) }, 'workshop'],
      ['long notes', { notes: 'x'.repeat(1001) }, 'notes'],
      ['empty lineItems', { lineItems: [] }, 'lineItems'],
      [
        'too many lineItems',
        { lineItems: Array.from({ length: 31 }, (_, i) => ({ itemId: `i${i}`, cost: 1 })) },
        'lineItems',
      ],
      [
        'duplicate itemId',
        {
          lineItems: [
            { itemId: 'engine_oil', cost: 1 },
            { itemId: 'engine_oil', cost: 2 },
          ],
        },
        'lineItems',
      ],
      ['negative cost', { lineItems: [{ itemId: 'engine_oil', cost: -1 }] }, 'lineItems.0.cost'],
      [
        'long brand',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, brand: 'x'.repeat(101) }] },
        'lineItems.0.brand',
      ],
      [
        'long item notes',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, notes: 'x'.repeat(501) }] },
        'lineItems.0.notes',
      ],
      [
        'nextDueKm below 100',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, nextDueKm: 99 }] },
        'lineItems.0.nextDueKm',
      ],
      [
        'nextDueKm above 200000',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, nextDueKm: 200001 }] },
        'lineItems.0.nextDueKm',
      ],
      [
        'nextDueMonths 0',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, nextDueMonths: 0 }] },
        'lineItems.0.nextDueMonths',
      ],
      [
        'nextDueMonths above 120',
        { lineItems: [{ itemId: 'engine_oil', cost: 1, nextDueMonths: 121 }] },
        'lineItems.0.nextDueMonths',
      ],
    ])('returns 400 for %s', async (_name, overrides, field) => {
      const res = await post({ ...visitBody, ...overrides }).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('returns 400 with details.lineItems for an unknown item id', async () => {
      const res = await post({ ...visitBody, lineItems: [{ itemId: 'nope', cost: 1 }] }).expect(
        400,
      );

      expect(res.body.error.details).toEqual({ lineItems: ['Unknown item: nope'] });
    });

    it('returns 400 for a serviceDate in the future', async () => {
      const res = await post({ ...visitBody, serviceDate: '2026-10-17T10:01:01Z' }).expect(400);

      expect(res.body.error.details).toEqual({ serviceDate: ['Must not be in the future'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const res = await post(visitBody, BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });

    it('returns 404 for a malformed vehicle id', async () => {
      await request(app)
        .post('/api/vehicles/nope/services')
        .set('Authorization', ALICE)
        .send(visitBody)
        .expect(404);
    });
  });

  describe('GET list', () => {
    it('returns the visits newest serviceDate first', async () => {
      const older = (
        await post({ ...visitBody, serviceDate: '2026-01-01T00:00:00Z', odometerKm: 1000 }).expect(
          201,
        )
      ).body.service.id;
      const newer = (
        await post({ ...visitBody, serviceDate: '2026-09-01T00:00:00Z', odometerKm: 1000 }).expect(
          201,
        )
      ).body.service.id;

      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body.services.map((s: { id: string }) => s.id)).toEqual([newer, older]);
    });

    it('returns an empty list for a vehicle without visits', async () => {
      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body).toEqual({ services: [] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(path).set('Authorization', BOB).expect(404);
    });
  });

  describe('GET one', () => {
    it('returns the visit', async () => {
      const id = await create();

      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(200);

      expect(res.body.service).toMatchObject({ id, vehicleId, totalCost: 2130000 });
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);

      expect(res.body).toEqual({ error: { message: 'Service not found' } });
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).get(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('PATCH', () => {
    it('returns 200 with the updated visit', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ lineItems: [{ itemId: 'battery', cost: 4000000 }], notes: 'باتری نو' })
        .expect(200);

      expect(res.body.service).toMatchObject({
        id,
        notes: 'باتری نو',
        lineItems: [
          {
            itemId: 'battery',
            brand: null,
            cost: 4000000,
            notes: null,
            nextDueKm: null,
            nextDueMonths: null,
          },
        ],
        totalCost: 4000000,
      });
    });

    it('returns 400 for an invalid field', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ odometerKm: -1 })
        .expect(400);

      expect(res.body.error.details).toHaveProperty(['odometerKm']);
    });

    it('returns 404 for an unknown visit', async () => {
      await request(app)
        .patch(`${path}/${UNKNOWN_ID}`)
        .set('Authorization', ALICE)
        .send({ workshop: 'x' })
        .expect(404);
    });
  });

  describe('DELETE', () => {
    it('returns 204 and the visit is gone', async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(204);

      await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('/:serviceId/invoice', () => {
    let serviceId: string;
    const INVOICE_URL = /^\/api\/vehicles\/[a-f\d]{24}\/services\/[a-f\d]{24}\/invoice\?v=\d+$/;

    beforeEach(async () => {
      serviceId = await create();
    });

    function upload(bytes: Buffer, contentType = 'image/png', field = 'invoice', auth = ALICE) {
      return request(app)
        .put(`${path}/${serviceId}/invoice`)
        .set('Authorization', auth)
        .attach(field, bytes, { filename: 'invoice.png', contentType });
    }

    function getInvoice() {
      return request(app)
        .get(`${path}/${serviceId}/invoice`)
        .set('Authorization', ALICE)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    }

    it('PUT returns 200 with the service, its invoice and a versioned invoiceUrl', async () => {
      const res = await upload(PNG_BYTES).expect(200);

      expect(res.body.service).toMatchObject({
        id: serviceId,
        invoice: {
          fileName: 'invoice.png',
          contentType: 'image/png',
          sizeBytes: PNG_BYTES.length,
          updatedAt: ISO_DATE,
        },
        invoiceUrl: expect.stringMatching(INVOICE_URL),
      });
    });

    it('PUT gives invoiceUrl a new v on replace', async () => {
      const first = await upload(PNG_BYTES).expect(200);

      const second = await upload(JPEG_BYTES, 'image/jpeg').expect(200);

      expect(second.body.service.invoiceUrl).not.toBe(first.body.service.invoiceUrl);
    });

    it('PUT returns 400 without a file', async () => {
      const res = await request(app)
        .put(`${path}/${serviceId}/invoice`)
        .set('Authorization', ALICE)
        .expect(400);

      expect(res.body.error.details).toEqual({ invoice: ['Required'] });
    });

    it('PUT returns 400 for a disallowed declared type', async () => {
      const res = await upload(PNG_BYTES, 'application/pdf').expect(400);

      expect(res.body.error.details).toEqual({ invoice: ['Must be a JPEG, PNG or WebP image'] });
    });

    it('PUT returns 400 when the bytes are not an image', async () => {
      const res = await upload(Buffer.from('<?php echo 1; ?>'), 'image/png').expect(400);

      expect(res.body.error.details).toEqual({ invoice: ['Must be a JPEG, PNG or WebP image'] });
    });

    it('PUT returns 413 above 5 MB', async () => {
      const tooBig = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);

      const res = await upload(tooBig).expect(413);

      expect(res.body).toEqual({ error: { message: 'File too large' } });
    });

    it("PUT returns 404 for another user's vehicle", async () => {
      await upload(PNG_BYTES, 'image/png', 'invoice', BOB).expect(404);
    });

    it('GET returns the bytes with a long private cache', async () => {
      await upload(JPEG_BYTES, 'image/jpeg').expect(200);

      const res = await getInvoice().expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('private, max-age=31536000');
      expect(res.body).toEqual(JPEG_BYTES);
    });

    it('GET returns 404 without an invoice', async () => {
      const res = await getInvoice().expect(404);

      expect(JSON.parse(res.body.toString())).toEqual({ error: { message: 'Invoice not found' } });
    });

    it('DELETE returns the service with invoice null', async () => {
      await upload(PNG_BYTES).expect(200);

      const res = await request(app)
        .delete(`${path}/${serviceId}/invoice`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body.service).toMatchObject({ id: serviceId, invoice: null, invoiceUrl: null });
      await getInvoice().expect(404);
    });

    it('GET list and GET one carry the invoice', async () => {
      const uploaded = await upload(PNG_BYTES).expect(200);

      const list = await request(app).get(path).set('Authorization', ALICE).expect(200);
      const one = await request(app)
        .get(`${path}/${serviceId}`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(list.body.services[0]).toEqual(uploaded.body.service);
      expect(one.body.service).toEqual(uploaded.body.service);
    });
  });

  describe('GET /api/service-suggestions', () => {
    it('returns 401 without a token', async () => {
      await request(app).get('/api/service-suggestions').expect(401);
    });

    it('returns workshops and brands from the garage history', async () => {
      await post(visitBody).expect(201);
      await post({
        ...visitBody,
        serviceDate: '2026-10-12T08:00:00.000Z',
        workshop: 'تعمیرگاه مرکزی',
        lineItems: [{ itemId: 'engine_oil', brand: 'الوند', cost: 1 }],
      }).expect(201);

      const res = await request(app)
        .get('/api/service-suggestions')
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body).toEqual({
        workshops: ['تعمیرگاه مرکزی', 'اتوسرویس البرز'],
        brands: { engine_oil: ['الوند', 'بهران رانا 5W-40'], oil_filter: ['سرکان'] },
      });
    });

    it('returns empty lists for a user without visits', async () => {
      const res = await request(app)
        .get('/api/service-suggestions')
        .set('Authorization', BOB)
        .expect(200);

      expect(res.body).toEqual({ workshops: [], brands: {} });
    });
  });

  it('deleting the vehicle deletes its visits', async () => {
    const id = await create();

    await request(app).delete(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE).expect(204);

    await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
  });
});
