import { z } from 'zod';

/** Grouping and Persian titles live on the client; the server only validates the enum. */
export const DOCUMENT_TYPES = [
  'third_party_insurance',
  'body_insurance',
  'inspection',
  'vehicle_card',
  'green_sheet',
  'power_of_attorney',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().datetime({ offset: true });

// `expiresAt > issuedAt` depends on the merged record, so DocumentService checks it.
export const createDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: text(100).nullish(),
  issuer: text(100).nullish(),
  number: text(50).nullish(),
  issuedAt: date.nullish(),
  /** null = permanent. */
  expiresAt: date.nullish(),
  /** Defaults to true (DocumentService applies it). */
  expiryReminder: z.boolean().optional(),
  notes: text(500).nullish(),
});

/** Nullable fields accept `null` to clear them. */
export const updateDocumentSchema = createDocumentSchema.partial();

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

/** A document as stored. */
export interface DocumentRecord {
  id: string;
  vehicleId: string;
  type: string;
  title: string | null;
  issuer: string | null;
  number: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  expiryReminder: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewDocument = Omit<DocumentRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type DocumentChanges = Partial<Omit<NewDocument, 'vehicleId'>>;

/** File facts without the bytes. */
export interface DocumentFileMeta {
  id: string;
  documentId: string;
  fileName: string;
  contentType: string;
  /** Plaintext size. */
  sizeBytes: number;
  createdAt: Date;
}

/** A file as stored: `data` is the encrypted blob. */
export interface DocumentFileRecord extends DocumentFileMeta {
  data: Uint8Array;
}

export type NewDocumentFile = Omit<DocumentFileRecord, 'id' | 'createdAt'>;

/** A file as exposed by the API. */
export interface DocumentFile {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  /** `/api/vehicles/:id/documents/:documentId/files/:fileId`. */
  url: string;
}

/** A document as exposed by the API. */
export interface VehicleDocument extends DocumentRecord {
  /** Oldest first; `[]` when none. */
  files: DocumentFile[];
}

/** A decrypted file, ready to send. */
export interface DocumentFileContent {
  fileName: string;
  contentType: string;
  data: Buffer;
}
