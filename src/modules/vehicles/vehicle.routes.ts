import { Router, type Request } from 'express';
import { ValidationError } from '../../shared/errors.ts';
import { imageUpload } from '../../shared/image-upload.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import {
  VEHICLE_PHOTO_BAD_TYPE,
  VEHICLE_PHOTO_CONTENT_TYPES,
  type VehicleService,
} from './vehicle.service.ts';
import { createVehicleSchema, updateVehicleSchema } from './vehicle.types.ts';

export const VEHICLE_PHOTO_FIELD = 'photo';
export const VEHICLE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// The `v` query in photoUrl changes on every upload, so the image itself can be cached for a year.
const PHOTO_CACHE_CONTROL = 'private, max-age=31536000';

/** Mount behind `requireAuth`: every handler reads the caller with `authUserId(res)`. */
export function vehicleRoutes(service: VehicleService, photoMaxBytes: number): Router {
  const router = Router();
  const photoUpload = imageUpload({
    field: VEHICLE_PHOTO_FIELD,
    maxBytes: photoMaxBytes,
    contentTypes: VEHICLE_PHOTO_CONTENT_TYPES,
    badTypeMessage: VEHICLE_PHOTO_BAD_TYPE,
  });

  router.get('/', async (_req, res) => {
    res.json(await service.list(authUserId(res)));
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createVehicleSchema, req.body);
    res.status(201).json(await service.create(authUserId(res), input));
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.getById(authUserId(res), req.params.id));
  });

  router.patch('/:id', async (req, res) => {
    const input = parseOrThrow(updateVehicleSchema, req.body);
    res.json(await service.update(authUserId(res), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await service.remove(authUserId(res), req.params.id);
    res.status(204).end();
  });

  router.put('/:id/photo', photoUpload, async (req: Request<{ id: string }>, res) => {
    if (!req.file) throw new ValidationError({ [VEHICLE_PHOTO_FIELD]: ['Required'] });
    res.json(await service.uploadPhoto(authUserId(res), req.params.id, req.file.buffer));
  });

  router.get('/:id/photo', async (req, res) => {
    const photo = await service.getPhoto(authUserId(res), req.params.id);
    res
      .set('Content-Type', photo.contentType)
      .set('Cache-Control', PHOTO_CACHE_CONTROL)
      .send(Buffer.from(photo.data));
  });

  router.delete('/:id/photo', async (req, res) => {
    res.json(await service.deletePhoto(authUserId(res), req.params.id));
  });

  return router;
}
