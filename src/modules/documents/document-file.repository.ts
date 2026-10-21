import type { PrismaClient } from '@prisma/client';
import type { DocumentFileMeta, DocumentFileRecord, NewDocumentFile } from './document.types.ts';

export interface DocumentFileRepository {
  /** File facts without bytes, oldest first. */
  listMetas(documentIds: string[]): Promise<DocumentFileMeta[]>;
  countByDocument(documentId: string): Promise<number>;
  /** The file (with its encrypted bytes) only if it belongs to the document. */
  findForDocument(id: string, documentId: string): Promise<DocumentFileRecord | null>;
  create(file: NewDocumentFile): Promise<DocumentFileMeta>;
  delete(id: string): Promise<void>;
  deleteByDocumentIds(documentIds: string[]): Promise<void>;
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
    return this.prisma.vehicleDocumentFile.findFirst({ where: { id, documentId } });
  }

  create({ data, ...file }: NewDocumentFile): Promise<DocumentFileMeta> {
    // Prisma wants bytes backed by a plain ArrayBuffer; a Node Buffer may sit on a shared pool.
    return this.prisma.vehicleDocumentFile.create({
      data: { ...file, data: new Uint8Array(data) },
      select: META_FIELDS,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicleDocumentFile.delete({ where: { id } });
  }

  async deleteByDocumentIds(documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;
    await this.prisma.vehicleDocumentFile.deleteMany({
      where: { documentId: { in: documentIds } },
    });
  }
}
