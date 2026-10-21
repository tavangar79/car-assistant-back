import { decryptBytes, encryptBytes } from '../../lib/file-crypto.ts';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import { detectFileType, type FileContentType } from '../../shared/file-type.ts';
import type { NotificationRepository } from '../notifications/notification.repository.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { DocumentFileRepository } from './document-file.repository.ts';
import type { DocumentRepository } from './document.repository.ts';
import type {
  CreateDocumentInput,
  DocumentFileContent,
  DocumentFileMeta,
  DocumentFileRecord,
  DocumentRecord,
  UpdateDocumentInput,
  VehicleDocument,
} from './document.types.ts';

export interface DocumentServiceDeps {
  documents: DocumentRepository;
  files: DocumentFileRepository;
  /** A deleted document's notifications go too. */
  notifications: NotificationRepository;
  /** Ownership checks come from here. */
  vehicles: VehicleService;
  /** AES-256-GCM key (32 bytes) for file bytes at rest. */
  encryptionKey: Uint8Array;
}

export const DOCUMENT_MAX_FILES = 4;
export const DOCUMENT_FILE_CONTENT_TYPES: readonly FileContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];
export const DOCUMENT_FILE_BAD_TYPE = 'Must be a PDF, JPEG or PNG file';
export const DOCUMENT_TOO_MANY_FILES = `A document can have at most ${DOCUMENT_MAX_FILES} files`;
export const EXPIRES_AFTER_ISSUED = 'Must be after issuedAt';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface FileUpload {
  fileName: string;
  data: Uint8Array;
}

const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/** Expiring soonest first (permanent ones last), then newest first. */
export function byExpiryThenNewest(a: DocumentRecord, b: DocumentRecord): number {
  const expiry = (d: DocumentRecord) => d.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return expiry(a) - expiry(b) || b.createdAt.getTime() - a.createdAt.getTime();
}

/** The API shape of a document: the record plus its files (oldest first) and their URLs. */
export function toDocument(document: DocumentRecord, files: DocumentFileMeta[]): VehicleDocument {
  return {
    ...document,
    files: files
      .filter((file) => file.documentId === document.id)
      .map(({ id, fileName, contentType, sizeBytes, createdAt }) => ({
        id,
        fileName,
        contentType,
        sizeBytes,
        createdAt,
        url: `/api/vehicles/${document.vehicleId}/documents/${document.id}/files/${id}`,
      })),
  };
}

/** Documents of a user's vehicle, with encrypted files. Another user's vehicle or document is "not found". */
export class DocumentService {
  constructor(private readonly deps: DocumentServiceDeps) {}

  async list(userId: string, vehicleId: string): Promise<VehicleDocument[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const documents = (await this.deps.documents.listByVehicles([vehicle.id])).sort(
      byExpiryThenNewest,
    );
    const files = await this.deps.files.listMetas(documents.map((document) => document.id));
    return documents.map((document) => toDocument(document, files));
  }

  async getById(userId: string, vehicleId: string, documentId: string): Promise<VehicleDocument> {
    return this.withFiles(await this.findOwned(userId, vehicleId, documentId));
  }

  async create(
    userId: string,
    vehicleId: string,
    input: CreateDocumentInput,
  ): Promise<VehicleDocument> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const issuedAt = toDate(input.issuedAt) ?? null;
    const expiresAt = toDate(input.expiresAt) ?? null;
    this.validate(issuedAt, expiresAt);

    const document = await this.deps.documents.create({
      vehicleId: vehicle.id,
      type: input.type,
      title: input.title ?? null,
      issuer: input.issuer ?? null,
      number: input.number ?? null,
      issuedAt,
      expiresAt,
      expiryReminder: input.expiryReminder ?? true,
      notes: input.notes ?? null,
    });
    return toDocument(document, []);
  }

  /** `null` clears a field. The `expiresAt > issuedAt` rule is checked on the merged record. */
  async update(
    userId: string,
    vehicleId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<VehicleDocument> {
    const existing = await this.findOwned(userId, vehicleId, documentId);
    const issuedAt = toDate(input.issuedAt);
    const expiresAt = toDate(input.expiresAt);
    this.validate(
      issuedAt === undefined ? existing.issuedAt : issuedAt,
      expiresAt === undefined ? existing.expiresAt : expiresAt,
    );

    const document = await this.deps.documents.update(existing.id, {
      type: input.type,
      title: input.title,
      issuer: input.issuer,
      number: input.number,
      issuedAt,
      expiresAt,
      expiryReminder: input.expiryReminder,
      notes: input.notes,
    });
    return this.withFiles(document);
  }

  /** Deletes its files and notifications too. */
  async remove(userId: string, vehicleId: string, documentId: string): Promise<void> {
    const document = await this.findOwned(userId, vehicleId, documentId);
    await this.deps.files.deleteByDocumentIds([document.id]);
    await this.deps.notifications.deleteByRefIds([document.id]);
    await this.deps.documents.delete(document.id);
  }

  /** Adds a file (encrypted at rest). The type comes from the magic bytes, not the client. */
  async addFile(
    userId: string,
    vehicleId: string,
    documentId: string,
    { fileName, data }: FileUpload,
  ): Promise<VehicleDocument> {
    const document = await this.findOwned(userId, vehicleId, documentId);
    const contentType = detectFileType(data, DOCUMENT_FILE_CONTENT_TYPES);
    if (!contentType) throw new ValidationError({ file: [DOCUMENT_FILE_BAD_TYPE] });
    if ((await this.deps.files.countByDocument(document.id)) >= DOCUMENT_MAX_FILES) {
      throw new AppError(422, DOCUMENT_TOO_MANY_FILES, { file: [DOCUMENT_TOO_MANY_FILES] });
    }

    await this.deps.files.create({
      documentId: document.id,
      fileName,
      contentType,
      sizeBytes: data.byteLength,
      data: encryptBytes(this.deps.encryptionKey, data),
    });
    return this.withFiles(document);
  }

  /** The decrypted file. */
  async getFile(
    userId: string,
    vehicleId: string,
    documentId: string,
    fileId: string,
  ): Promise<DocumentFileContent> {
    const document = await this.findOwned(userId, vehicleId, documentId);
    const file = await this.findFile(document.id, fileId);
    return {
      fileName: file.fileName,
      contentType: file.contentType,
      data: decryptBytes(this.deps.encryptionKey, file.data),
    };
  }

  async deleteFile(
    userId: string,
    vehicleId: string,
    documentId: string,
    fileId: string,
  ): Promise<VehicleDocument> {
    const document = await this.findOwned(userId, vehicleId, documentId);
    const file = await this.findFile(document.id, fileId);
    await this.deps.files.delete(file.id);
    return this.withFiles(document);
  }

  /** A rule zod can't express on a partial update: the dates of the merged record. */
  private validate(issuedAt: Date | null, expiresAt: Date | null): void {
    if (issuedAt && expiresAt && expiresAt.getTime() <= issuedAt.getTime()) {
      throw new ValidationError({ expiresAt: [EXPIRES_AFTER_ISSUED] });
    }
  }

  /** 404 for another user's vehicle, a malformed id, an unknown id, or another vehicle's document. */
  private async findOwned(
    userId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<DocumentRecord> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const document = OBJECT_ID_PATTERN.test(documentId)
      ? await this.deps.documents.findForVehicle(documentId, vehicle.id)
      : null;
    if (!document) throw new NotFoundError('Document');
    return document;
  }

  private async findFile(documentId: string, fileId: string): Promise<DocumentFileRecord> {
    const file = OBJECT_ID_PATTERN.test(fileId)
      ? await this.deps.files.findForDocument(fileId, documentId)
      : null;
    if (!file) throw new NotFoundError('File');
    return file;
  }

  private async withFiles(document: DocumentRecord): Promise<VehicleDocument> {
    return toDocument(document, await this.deps.files.listMetas([document.id]));
  }
}
