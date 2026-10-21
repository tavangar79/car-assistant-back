import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { JPEG_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);

const body = {
  nickname: '  تارا اتوماتیک نقره‌ای ',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  vin: 'naam21ca9kk123456',
  makeId: 'iran-khodro',
  modelId: 'tara',
  trimId: 'tara-v4-at',
  yearJalali: 1402,
  mileageKm: 34500,
  color: 'white',
  isDefault: true,
};

describe('/api/vehicles', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createTestDependencies({ now: () => new Date('2026-10-17T10:00:00Z') }));
  });

  async function createVehicle(auth = ALICE, overrides: object = {}): Promise<{ id: string }> {
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', auth)
      .send({ ...body, ...overrides })
      .expect(201);
    return res.body;
  }

  it.each([
    ['get', '/api/vehicles'],
    ['post', '/api/vehicles'],
    ['get', '/api/vehicles/000000000000000000000000'],
    ['patch', '/api/vehicles/000000000000000000000000'],
    ['delete', '/api/vehicles/000000000000000000000000'],
    ['put', '/api/vehicles/000000000000000000000000/photo'],
    ['get', '/api/vehicles/000000000000000000000000/photo'],
    ['delete', '/api/vehicles/000000000000000000000000/photo'],
    ['get', '/api/vehicle-catalog'],
  ] as const)('%s %s returns 401 without a token', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the full vehicle shape', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send(body)
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        nickname: 'تارا اتوماتیک نقره‌ای',
        plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
        vin: 'NAAM21CA9KK123456',
        make: { id: 'iran-khodro', name: 'ایران خودرو' },
        model: { id: 'tara', name: 'تارا' },
        trim: { id: 'tara-v4-at', name: 'V4 اتوماتیک - فول آپشن' },
        yearJalali: 1402,
        mileageKm: 34500,
        color: 'white',
        isDefault: true,
        photoUrl: null,
        createdAt: ISO_DATE,
        updatedAt: ISO_DATE,
      });
    });

    it('returns 400 with details keyed by field path', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send({
          ...body,
          nickname: '   ',
          plate: { twoDigits: '7', letter: 'X', threeDigits: '34a', provinceCode: '' },
          vin: 'IOQ',
          yearJalali: 1299,
          mileageKm: 2_000_001,
          color: 'green',
          isDefault: 'yes',
        })
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(Object.keys(res.body.error.details).sort()).toEqual(
        [
          'nickname',
          'plate.twoDigits',
          'plate.letter',
          'plate.threeDigits',
          'plate.provinceCode',
          'vin',
          'yearJalali',
          'mileageKm',
          'color',
          'isDefault',
        ].sort(),
      );
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send({})
        .expect(400);

      expect(Object.keys(res.body.error.details).sort()).toEqual(
        ['makeId', 'mileageKm', 'modelId', 'nickname', 'plate', 'yearJalali'].sort(),
      );
    });

    it('returns 400 for a model of another make', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send({ ...body, makeId: 'saipa', trimId: null })
        .expect(400);

      expect(res.body.error.details).toEqual({ modelId: ['Model does not belong to the make'] });
    });

    it('returns 400 for a year after next Jalali year', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send({ ...body, yearJalali: 1407 })
        .expect(400);

      expect(res.body.error.details).toEqual({ yearJalali: ['Must be 1406 or earlier'] });
    });

    it('returns 409 for a plate already in the garage', async () => {
      await createVehicle();

      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send(body)
        .expect(409);

      expect(res.body).toEqual({ error: { message: 'Plate already registered' } });
    });
  });

  describe('GET list / by id', () => {
    it("lists only the caller's vehicles", async () => {
      const mine = await createVehicle();
      await createVehicle(BOB);

      const res = await request(app).get('/api/vehicles').set('Authorization', ALICE).expect(200);

      expect(res.body.map((v: { id: string }) => v.id)).toEqual([mine.id]);
    });

    it("returns 404 for another user's vehicle", async () => {
      const bobs = await createVehicle(BOB);

      const res = await request(app)
        .get(`/api/vehicles/${bobs.id}`)
        .set('Authorization', ALICE)
        .expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });
  });

  describe('PATCH', () => {
    it('updates the given fields', async () => {
      const created = await createVehicle();

      const res = await request(app)
        .patch(`/api/vehicles/${created.id}`)
        .set('Authorization', ALICE)
        .send({ mileageKm: 40000, vin: null })
        .expect(200);

      expect(res.body).toMatchObject({
        mileageKm: 40000,
        vin: null,
        nickname: 'تارا اتوماتیک نقره‌ای',
      });
    });

    it('returns 400 with path details for a bad plate', async () => {
      const created = await createVehicle();

      const res = await request(app)
        .patch(`/api/vehicles/${created.id}`)
        .set('Authorization', ALICE)
        .send({ plate: { ...body.plate, letter: 'X' } })
        .expect(400);

      expect(Object.keys(res.body.error.details)).toEqual(['plate.letter']);
    });

    it('returns 422 when unsetting the default and changes nothing', async () => {
      const created = await createVehicle();

      const res = await request(app)
        .patch(`/api/vehicles/${created.id}`)
        .set('Authorization', ALICE)
        .send({ isDefault: false, mileageKm: 1 })
        .expect(422);

      expect(res.body).toEqual({ error: { message: 'Set another vehicle as default instead' } });
      const after = await request(app)
        .get(`/api/vehicles/${created.id}`)
        .set('Authorization', ALICE);
      expect(after.body).toMatchObject({ isDefault: true, mileageKm: 34500 });
    });

    it('returns 200 for isDefault false on a non-default vehicle', async () => {
      await createVehicle();
      const second = await createVehicle(ALICE, {
        plate: { ...body.plate, threeDigits: '999' },
        isDefault: false,
      });

      const res = await request(app)
        .patch(`/api/vehicles/${second.id}`)
        .set('Authorization', ALICE)
        .send({ isDefault: false })
        .expect(200);

      expect(res.body.isDefault).toBe(false);
    });

    it('moves the default with isDefault true', async () => {
      const first = await createVehicle();
      const second = await createVehicle(ALICE, {
        plate: { ...body.plate, threeDigits: '999' },
        isDefault: false,
      });

      await request(app)
        .patch(`/api/vehicles/${second.id}`)
        .set('Authorization', ALICE)
        .send({ isDefault: true })
        .expect(200);

      const list = await request(app).get('/api/vehicles').set('Authorization', ALICE);
      expect(list.body.map((v: { id: string; isDefault: boolean }) => [v.id, v.isDefault])).toEqual(
        [
          [second.id, true],
          [first.id, false],
        ],
      );
    });

    it("returns 404 for another user's vehicle", async () => {
      const bobs = await createVehicle(BOB);

      await request(app)
        .patch(`/api/vehicles/${bobs.id}`)
        .set('Authorization', ALICE)
        .send({ mileageKm: 1 })
        .expect(404);
    });
  });

  describe('POST default', () => {
    it('makes the first vehicle default even when isDefault is false', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', ALICE)
        .send({ ...body, isDefault: false })
        .expect(201);

      expect(res.body.isDefault).toBe(true);
    });
  });

  describe('DELETE', () => {
    it('promotes the newest remaining vehicle when the default goes', async () => {
      const first = await createVehicle();
      await createVehicle(ALICE, {
        plate: { ...body.plate, threeDigits: '998' },
        isDefault: false,
      });
      const third = await createVehicle(ALICE, {
        plate: { ...body.plate, threeDigits: '999' },
        isDefault: false,
      });

      await request(app)
        .delete(`/api/vehicles/${first.id}`)
        .set('Authorization', ALICE)
        .expect(204);

      const res = await request(app).get(`/api/vehicles/${third.id}`).set('Authorization', ALICE);
      expect(res.body.isDefault).toBe(true);
    });

    it('returns 204 and the vehicle is gone', async () => {
      const created = await createVehicle();

      await request(app)
        .delete(`/api/vehicles/${created.id}`)
        .set('Authorization', ALICE)
        .expect(204);
      await request(app).get(`/api/vehicles/${created.id}`).set('Authorization', ALICE).expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const bobs = await createVehicle(BOB);

      await request(app).delete(`/api/vehicles/${bobs.id}`).set('Authorization', ALICE).expect(404);
    });
  });

  describe('/:id/photo', () => {
    let vehicleId: string;
    const PHOTO_URL = /^\/api\/vehicles\/[a-f\d]{24}\/photo\?v=\d+$/;

    beforeEach(async () => {
      vehicleId = (await createVehicle()).id;
    });

    function upload(bytes: Buffer, contentType = 'image/png', field = 'photo', auth = ALICE) {
      return request(app)
        .put(`/api/vehicles/${vehicleId}/photo`)
        .set('Authorization', auth)
        .attach(field, bytes, { filename: 'car', contentType });
    }

    function getPhoto() {
      return request(app)
        .get(`/api/vehicles/${vehicleId}/photo`)
        .set('Authorization', ALICE)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    }

    it('PUT returns 200 with the vehicle and a versioned photoUrl', async () => {
      const res = await upload(PNG_BYTES).expect(200);

      expect(res.body).toMatchObject({ id: vehicleId, photoUrl: expect.stringMatching(PHOTO_URL) });
    });

    it('PUT gives photoUrl a new v on replace', async () => {
      const first = await upload(PNG_BYTES).expect(200);

      const second = await upload(JPEG_BYTES, 'image/jpeg').expect(200);

      expect(second.body.photoUrl).not.toBe(first.body.photoUrl);
    });

    it('PUT returns 400 without a file', async () => {
      const res = await request(app)
        .put(`/api/vehicles/${vehicleId}/photo`)
        .set('Authorization', ALICE)
        .expect(400);

      expect(res.body.error.details).toEqual({ photo: ['Required'] });
    });

    it('PUT returns 400 for a WebP declared type', async () => {
      const res = await upload(PNG_BYTES, 'image/webp').expect(400);

      expect(res.body.error.details).toEqual({ photo: ['Must be a JPEG or PNG image'] });
    });

    it('PUT returns 400 when the bytes are not JPEG or PNG', async () => {
      const res = await upload(Buffer.from('<?php echo 1; ?>'), 'image/png').expect(400);

      expect(res.body.error.details).toEqual({ photo: ['Must be a JPEG or PNG image'] });
    });

    it('PUT returns 413 above 5 MB', async () => {
      const tooBig = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);

      const res = await upload(tooBig).expect(413);

      expect(res.body).toEqual({ error: { message: 'File too large' } });
    });

    it("PUT returns 404 for another user's vehicle", async () => {
      const res = await upload(PNG_BYTES, 'image/png', 'photo', BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });

    it('GET returns the bytes with the detected type and a long private cache', async () => {
      await upload(JPEG_BYTES, 'image/png').expect(200);

      const res = await getPhoto().expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('private, max-age=31536000');
      expect(Buffer.compare(res.body as Buffer, JPEG_BYTES)).toBe(0);
    });

    it('GET returns 404 without a photo', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${vehicleId}/photo`)
        .set('Authorization', ALICE)
        .expect(404);

      expect(res.body).toEqual({ error: { message: 'Photo not found' } });
    });

    it('DELETE returns the vehicle with photoUrl null', async () => {
      await upload(PNG_BYTES).expect(200);

      const res = await request(app)
        .delete(`/api/vehicles/${vehicleId}/photo`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body).toMatchObject({ id: vehicleId, photoUrl: null });
      await getPhoto().expect(404);
    });

    it('GET list carries the photoUrl', async () => {
      const uploaded = await upload(PNG_BYTES).expect(200);

      const res = await request(app).get('/api/vehicles').set('Authorization', ALICE).expect(200);

      expect(res.body[0].photoUrl).toBe(uploaded.body.photoUrl);
    });
  });
});

describe('GET /api/vehicle-catalog', () => {
  it('returns the makes with models and trims', async () => {
    const app = createApp(createTestDependencies());

    const res = await request(app)
      .get('/api/vehicle-catalog')
      .set('Authorization', ALICE)
      .expect(200);

    const ikco = res.body.makes.find((make: { id: string }) => make.id === 'iran-khodro');
    expect(ikco).toMatchObject({ id: 'iran-khodro', name: 'ایران خودرو' });
    expect(ikco.models).toContainEqual(
      expect.objectContaining({
        id: 'tara',
        name: 'تارا',
        trims: expect.arrayContaining([{ id: 'tara-v4-at', name: 'V4 اتوماتیک - فول آپشن' }]),
      }),
    );
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    await request(createApp(createTestDependencies())).get('/health').expect(200, { status: 'ok' });
  });
});
