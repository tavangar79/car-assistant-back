import { randomBytes } from 'node:crypto';
import type { DocumentRepository } from '../modules/documents/document.repository.ts';
import type {
  DocumentChanges,
  DocumentRecord,
  NewDocument,
} from '../modules/documents/document.types.ts';

export class InMemoryDocumentRepository implements DocumentRepository {
  readonly documents = new Map<string, DocumentRecord>();
  /** Each write is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async listByVehicles(vehicleIds: string[]): Promise<DocumentRecord[]> {
    return [...this.documents.values()].filter((d) => vehicleIds.includes(d.vehicleId));
  }

  async countByVehicles(vehicleIds: string[]): Promise<number> {
    return (await this.listByVehicles(vehicleIds)).length;
  }

  async findForVehicle(id: string, vehicleId: string): Promise<DocumentRecord | null> {
    const document = this.documents.get(id);
    return document?.vehicleId === vehicleId ? document : null;
  }

  async create(input: NewDocument): Promise<DocumentRecord> {
    const now = new Date(this.clock++);
    const document: DocumentRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(document.id, document);
    return document;
  }

  async update(id: string, changes: DocumentChanges): Promise<DocumentRecord> {
    const existing = this.documents.get(id);
    if (!existing) throw new Error(`Document ${id} not found`);
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: DocumentRecord = { ...existing, ...defined, updatedAt: new Date(this.clock++) };
    this.documents.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const ids = [...this.documents.values()]
      .filter((document) => document.vehicleId === vehicleId)
      .map((document) => document.id);
    for (const id of ids) this.documents.delete(id);
    return ids;
  }
}
