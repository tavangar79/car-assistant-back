import type { PrismaClient } from '@prisma/client';
import type { DocumentFileMeta, DocumentFileRecord, NewDocumentFile } from './document.types.ts';

export interface DocumentFileRepository {
  /** File facts, oldest first. */
  listMetas(documentIds: string[]): Promise<DocumentFileMeta[]>;
  countByDocument(documentId: string): Promise<number>;
  /** The file row (with its storage key) only if it belongs to the document. */
  findForDocument(id: string, documentId: string): Promise<DocumentFileRecord | null>;
  create(file: NewDocumentFile): Promise<DocumentFileMeta>;
  delete(id: string): Promise<void>;
  /** The storage keys of the removed rows. */
  deleteByDocumentIds(documentIds: string[]): Promise<string[]>;
}

const META_FIELDS = {
  id: true,
  documentId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

export class PrismaDocumentFileRepository implements DocumentFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listMetas(documentIds: string[]): Promise<DocumentFileMeta[]> {
    return this.prisma.vehicleDocumentFile.findMany({
      where: { documentId: { in: documentIds } },
      select: META_FIELDS,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  countByDocument(documentId: string): Promise<number> {
    return this.prisma.vehicleDocumentFile.count({ where: { documentId } });
  }

  findForDocument(id: string, documentId: string): Promise<DocumentFileRecord | null> {
    return this.prisma.vehicleDocumentFile.findFirst({
      where: { id, documentId },
      select: { ...META_FIELDS, storageKey: true },
    });
  }

  create(file: NewDocumentFile): Promise<DocumentFileMeta> {
    return this.prisma.vehicleDocumentFile.create({ data: file, select: META_FIELDS });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicleDocumentFile.delete({ where: { id } });
  }

  async deleteByDocumentIds(documentIds: string[]): Promise<string[]> {
    if (documentIds.length === 0) return [];
    const where = { documentId: { in: documentIds } };
    const rows = await this.prisma.vehicleDocumentFile.findMany({
      where,
      select: { storageKey: true },
    });
    await this.prisma.vehicleDocumentFile.deleteMany({ where });
    return rows.map((row) => row.storageKey);
  }
}
