import { Router, type Request } from 'express';
import { ValidationError } from '../../shared/errors.ts';
import { imageUpload } from '../../shared/image-upload.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import {
  SERVICE_INVOICE_BAD_TYPE,
  SERVICE_INVOICE_CONTENT_TYPES,
  type ServiceVisitService,
} from './service-visit.service.ts';
import { createServiceVisitSchema, updateServiceVisitSchema } from './service-visit.types.ts';

export const SERVICE_INVOICE_FIELD = 'invoice';
export const SERVICE_INVOICE_MAX_BYTES = 5 * 1024 * 1024;

// The `v` query in invoiceUrl changes on every upload, so the image itself can be cached for a year.
const INVOICE_CACHE_CONTROL = 'private, max-age=31536000';

type VisitParams = { id: string; serviceId: string };

/** `/:id/services` of the vehicles router; mount behind `requireAuth`. */
export function serviceVisitRoutes(service: ServiceVisitService, invoiceMaxBytes: number): Router {
  const router = Router();
  const invoiceUpload = imageUpload({
    field: SERVICE_INVOICE_FIELD,
    maxBytes: invoiceMaxBytes,
    contentTypes: SERVICE_INVOICE_CONTENT_TYPES,
    badTypeMessage: SERVICE_INVOICE_BAD_TYPE,
  });

  router.post('/:id/services', async (req, res) => {
    const input = parseOrThrow(createServiceVisitSchema, req.body);
    const visit = await service.create(authUserId(res), req.params.id, input);
    res.status(201).json({ service: visit });
  });

  router.get('/:id/services', async (req, res) => {
    res.json({ services: await service.list(authUserId(res), req.params.id) });
  });

  router.get('/:id/services/:serviceId', async (req, res) => {
    const { id, serviceId } = req.params;
    res.json({ service: await service.getById(authUserId(res), id, serviceId) });
  });

  router.patch('/:id/services/:serviceId', async (req, res) => {
    const input = parseOrThrow(updateServiceVisitSchema, req.body);
    const { id, serviceId } = req.params;
    res.json({ service: await service.update(authUserId(res), id, serviceId, input) });
  });

  router.delete('/:id/services/:serviceId', async (req, res) => {
    const { id, serviceId } = req.params;
    await service.remove(authUserId(res), id, serviceId);
    res.status(204).end();
  });

  router.put(
    '/:id/services/:serviceId/invoice',
    invoiceUpload,
    async (req: Request<VisitParams>, res) => {
      if (!req.file) throw new ValidationError({ [SERVICE_INVOICE_FIELD]: ['Required'] });
      const { id, serviceId } = req.params;
      const upload = { fileName: req.file.originalname, data: req.file.buffer };
      res.json({ service: await service.uploadInvoice(authUserId(res), id, serviceId, upload) });
    },
  );

  router.get('/:id/services/:serviceId/invoice', async (req, res) => {
    const { id, serviceId } = req.params;
    const invoice = await service.getInvoice(authUserId(res), id, serviceId);
    res
      .set('Content-Type', invoice.contentType)
      .set('Cache-Control', INVOICE_CACHE_CONTROL)
      .send(Buffer.from(invoice.data));
  });

  router.delete('/:id/services/:serviceId/invoice', async (req, res) => {
    const { id, serviceId } = req.params;
    res.json({ service: await service.deleteInvoice(authUserId(res), id, serviceId) });
  });

  return router;
}
