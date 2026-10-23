import type { PrismaClient } from '@prisma/client';
import type { NewServiceItemDef, ServiceItemDef, ServiceItemDefPatch } from './catalog.types.ts';

/** Every row in every scope. The collection is tiny, so readers load all of it per request. */
export interface ServiceItemDefRepository {
  listAll(): Promise<ServiceItemDef[]>;
  findById(id: string): Promise<ServiceItemDef | null>;
  create(row: NewServiceItemDef): Promise<ServiceItemDef>;
  /** Only call for an existing row. */
  update(id: string, patch: ServiceItemDefPatch): Promise<ServiceItemDef>;
  delete(id: string): Promise<void>;
}

export class PrismaServiceItemDefRepository implements ServiceItemDefRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listAll(): Promise<ServiceItemDef[]> {
    return this.prisma.serviceItemDef.findMany();
  }

  findById(id: string): Promise<ServiceItemDef | null> {
    return this.prisma.serviceItemDef.findUnique({ where: { id } });
  }

  create(row: NewServiceItemDef): Promise<ServiceItemDef> {
    return this.prisma.serviceItemDef.create({ data: row });
  }

  update(id: string, patch: ServiceItemDefPatch): Promise<ServiceItemDef> {
    return this.prisma.serviceItemDef.update({ where: { id }, data: patch });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.serviceItemDef.deleteMany({ where: { id } });
  }
}
