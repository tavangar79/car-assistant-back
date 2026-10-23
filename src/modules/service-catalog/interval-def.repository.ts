import type { PrismaClient } from '@prisma/client';
import type { IntervalDef, IntervalDefPatch, NewIntervalDef } from './catalog.types.ts';

/** Every row in every scope. The collection is tiny, so readers load all of it per request. */
export interface IntervalDefRepository {
  listAll(): Promise<IntervalDef[]>;
  findById(id: string): Promise<IntervalDef | null>;
  create(row: NewIntervalDef): Promise<IntervalDef>;
  /** Only call for an existing row. */
  update(id: string, patch: IntervalDefPatch): Promise<IntervalDef>;
  delete(id: string): Promise<void>;
}

export class PrismaIntervalDefRepository implements IntervalDefRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listAll(): Promise<IntervalDef[]> {
    return this.prisma.intervalDef.findMany();
  }

  findById(id: string): Promise<IntervalDef | null> {
    return this.prisma.intervalDef.findUnique({ where: { id } });
  }

  create(row: NewIntervalDef): Promise<IntervalDef> {
    return this.prisma.intervalDef.create({ data: row });
  }

  update(id: string, patch: IntervalDefPatch): Promise<IntervalDef> {
    return this.prisma.intervalDef.update({ where: { id }, data: patch });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.intervalDef.deleteMany({ where: { id } });
  }
}
