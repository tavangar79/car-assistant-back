import { Router, type Request } from 'express';
import { ValidationError } from '../../shared/errors.ts';
import { fileUpload } from '../../shared/file-upload.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import {
  EXPENSE_ATTACHMENT_BAD_TYPE,
  EXPENSE_ATTACHMENT_CONTENT_TYPES,
  type ExpenseService,
} from './expense.service.ts';
import { createExpenseSchema, updateExpenseSchema } from './expense.types.ts';

export const EXPENSE_ATTACHMENT_FIELD = 'attachment';
export const EXPENSE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

// The `v` query in attachmentUrl changes on every upload, so the file itself can be cached for a year.
const ATTACHMENT_CACHE_CONTROL = 'private, max-age=31536000';

type ExpenseParams = { id: string; expenseId: string };

/** `/:id/expenses` of the vehicles router; mount behind `requireAuth`. */
export function expenseRoutes(service: ExpenseService, attachmentMaxBytes: number): Router {
  const router = Router();
  const attachmentUpload = fileUpload({
    field: EXPENSE_ATTACHMENT_FIELD,
    maxBytes: attachmentMaxBytes,
    contentTypes: EXPENSE_ATTACHMENT_CONTENT_TYPES,
    badTypeMessage: EXPENSE_ATTACHMENT_BAD_TYPE,
  });

  router.post('/:id/expenses', async (req, res) => {
    const input = parseOrThrow(createExpenseSchema, req.body);
    const expense = await service.create(authUserId(res), req.params.id, input);
    res.status(201).json({ expense });
  });

  router.get('/:id/expenses', async (req, res) => {
    res.json({ expenses: await service.list(authUserId(res), req.params.id) });
  });

  router.get('/:id/expenses/:expenseId', async (req, res) => {
    const { id, expenseId } = req.params;
    res.json({ expense: await service.getById(authUserId(res), id, expenseId) });
  });

  router.patch('/:id/expenses/:expenseId', async (req, res) => {
    const input = parseOrThrow(updateExpenseSchema, req.body);
    const { id, expenseId } = req.params;
    res.json({ expense: await service.update(authUserId(res), id, expenseId, input) });
  });

  router.delete('/:id/expenses/:expenseId', async (req, res) => {
    const { id, expenseId } = req.params;
    await service.remove(authUserId(res), id, expenseId);
    res.status(204).end();
  });

  router.put(
    '/:id/expenses/:expenseId/attachment',
    attachmentUpload,
    async (req: Request<ExpenseParams>, res) => {
      if (!req.file) throw new ValidationError({ [EXPENSE_ATTACHMENT_FIELD]: ['Required'] });
      const { id, expenseId } = req.params;
      const upload = { fileName: req.file.originalname, data: req.file.buffer };
      res.json({
        expense: await service.uploadAttachment(authUserId(res), id, expenseId, upload),
      });
    },
  );

  router.get('/:id/expenses/:expenseId/attachment', async (req, res) => {
    const { id, expenseId } = req.params;
    const attachment = await service.getAttachment(authUserId(res), id, expenseId);
    res
      .set('Content-Type', attachment.contentType)
      .set('Cache-Control', ATTACHMENT_CACHE_CONTROL)
      .send(Buffer.from(attachment.data));
  });

  router.delete('/:id/expenses/:expenseId/attachment', async (req, res) => {
    const { id, expenseId } = req.params;
    res.json({ expense: await service.deleteAttachment(authUserId(res), id, expenseId) });
  });

  return router;
}
