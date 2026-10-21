import { randomBytes } from 'node:crypto';
import type { DocumentFileRepository } from '../modules/documents/document-file.repository.ts';
import type {
  DocumentFileMeta,
  DocumentFileRecord,
  NewDocumentFile,
} from '../modules/documents/document.types.ts';

function toMeta(file: DocumentFileRecord): DocumentFileMeta {
  const { id, documentId, fileName, contentType, sizeBytes, createdAt } = file;
  return { id, documentId, fileName, contentType, sizeBytes, createdAt };
}

export class InMemoryDocumentFileRepository implements DocumentFileRepository {
  /** Insertion order is creation order. */
  readonly files = new Map<string, DocumentFileRecord>();
  /** Each write is 1 ms later than the previous one. */
  private clock = Date.UTC(2026, 0, 1);

  async listMetas(documentIds: string[]): Promise<DocumentFileMeta[]> {
    return [...this.files.values()].filter((f) => documentIds.includes(f.documentId)).map(toMeta);
  }

  async countByDocument(documentId: string): Promise<number> {
    return (await this.listMetas([documentId])).length;
  }

  async findForDocument(id: string, documentId: string): Promise<DocumentFileRecord | null> {
    const file = this.files.get(id);
    return file?.documentId === documentId ? file : null;
  }

  async create(input: NewDocumentFile): Promise<DocumentFileMeta> {
    const file: DocumentFileRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: new Date(this.clock++),
    };
    this.files.set(file.id, file);
    return toMeta(file);
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }

  async deleteByDocumentIds(documentIds: string[]): Promise<void> {
    for (const [id, file] of this.files) {
      if (documentIds.includes(file.documentId)) this.files.delete(id);
    }
  }
}
