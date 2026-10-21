import type { PrismaClient } from '@prisma/client';
import type { DocumentChanges, DocumentRecord, NewDocument } from './document.types.ts';

export interface DocumentRepository {
  /** Every document of these vehicles, in no particular order (DocumentService sorts). */
  listByVehicles(vehicleIds: string[]): Promise<DocumentRecord[]>;
  countByVehicles(vehicleIds: string[]): Promise<number>;
  /** The document only if it belongs to the vehicle. */
  findForVehicle(id: string, vehicleId: string): Promise<DocumentRecord | null>;
  create(document: NewDocument): Promise<DocumentRecord>;
  /** `null` clears a field; `undefined` leaves it. */
  update(id: string, changes: DocumentChanges): Promise<DocumentRecord>;
  delete(id: string): Promise<void>;
  /** Deletes every document of the vehicle and returns their ids (so files and notifications can go too). */
  deleteByVehicle(vehicleId: string): Promise<string[]>;
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByVehicles(vehicleIds: string[]): Promise<DocumentRecord[]> {
    return this.prisma.vehicleDocument.findMany({ where: { vehicleId: { in: vehicleIds } } });
  }

  countByVehicles(vehicleIds: string[]): Promise<number> {
    return this.prisma.vehicleDocument.count({ where: { vehicleId: { in: vehicleIds } } });
  }

  findForVehicle(id: string, vehicleId: string): Promise<DocumentRecord | null> {
    return this.prisma.vehicleDocument.findFirst({ where: { id, vehicleId } });
  }

  create(document: NewDocument): Promise<DocumentRecord> {
    return this.prisma.vehicleDocument.create({ data: document });
  }

  update(id: string, changes: DocumentChanges): Promise<DocumentRecord> {
    return this.prisma.vehicleDocument.update({ where: { id }, data: changes });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicleDocument.delete({ where: { id } });
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const documents = await this.prisma.vehicleDocument.findMany({
      where: { vehicleId },
      select: { id: true },
    });
    await this.prisma.vehicleDocument.deleteMany({ where: { vehicleId } });
    return documents.map((document) => document.id);
  }
}
