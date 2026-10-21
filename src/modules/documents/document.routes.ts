import { Router } from 'express';
import { ValidationError } from '../../shared/errors.ts';
import { fileUpload } from '../../shared/file-upload.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import {
  DOCUMENT_FILE_BAD_TYPE,
  DOCUMENT_FILE_CONTENT_TYPES,
  type DocumentService,
} from './document.service.ts';
import { createDocumentSchema, updateDocumentSchema } from './document.types.ts';

export const DOCUMENT_FILE_FIELD = 'file';
export const DOCUMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

// A file id never points at different bytes, so the file can be cached for a year.
const FILE_CACHE_CONTROL = 'private, max-age=31536000';

/** RFC 5987 `filename*` value, so Persian names survive. */
export function inlineDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename*=UTF-8''${encoded}`;
}

/** `/:id/documents` of the vehicles router; mount behind `requireAuth`. */
export function documentRoutes(service: DocumentService, fileMaxBytes: number): Router {
  const router = Router();
  const upload = fileUpload({
    field: DOCUMENT_FILE_FIELD,
    maxBytes: fileMaxBytes,
    contentTypes: DOCUMENT_FILE_CONTENT_TYPES,
    badTypeMessage: DOCUMENT_FILE_BAD_TYPE,
  });

  router.get('/:id/documents', async (req, res) => {
    res.json({ documents: await service.list(authUserId(res), req.params.id) });
  });

  router.post('/:id/documents', async (req, res) => {
    const input = parseOrThrow(createDocumentSchema, req.body);
    const document = await service.create(authUserId(res), req.params.id, input);
    res.status(201).json({ document });
  });

  router.get('/:id/documents/:documentId', async (req, res) => {
    const { id, documentId } = req.params;
    res.json({ document: await service.getById(authUserId(res), id, documentId) });
  });

  router.patch('/:id/documents/:documentId', async (req, res) => {
    const input = parseOrThrow(updateDocumentSchema, req.body);
    const { id, documentId } = req.params;
    res.json({ document: await service.update(authUserId(res), id, documentId, input) });
  });

  router.delete('/:id/documents/:documentId', async (req, res) => {
    const { id, documentId } = req.params;
    await service.remove(authUserId(res), id, documentId);
    res.status(204).end();
  });

  router.post('/:id/documents/:documentId/files', upload, async (req, res) => {
    if (!req.file) throw new ValidationError({ [DOCUMENT_FILE_FIELD]: ['Required'] });
    const { id, documentId } = req.params as { id: string; documentId: string };
    const file = { fileName: req.file.originalname, data: req.file.buffer };
    const document = await service.addFile(authUserId(res), id, documentId, file);
    res.status(201).json({ document });
  });

  router.get('/:id/documents/:documentId/files/:fileId', async (req, res) => {
    const { id, documentId, fileId } = req.params;
    const file = await service.getFile(authUserId(res), id, documentId, fileId);
    res
      .set('Content-Type', file.contentType)
      .set('Content-Disposition', inlineDisposition(file.fileName))
      .set('Cache-Control', FILE_CACHE_CONTROL)
      .send(file.data);
  });

  router.delete('/:id/documents/:documentId/files/:fileId', async (req, res) => {
    const { id, documentId, fileId } = req.params;
    res.json({ document: await service.deleteFile(authUserId(res), id, documentId, fileId) });
  });

  return router;
}
