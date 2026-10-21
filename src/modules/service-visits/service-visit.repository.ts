import type { PrismaClient } from '@prisma/client';
import type {
  NewServiceVisit,
  ServiceVisitChanges,
  ServiceVisitRecord,
} from './service-visit.types.ts';

export interface ServiceVisitRepository {
  /** Newest `serviceDate` first, then newest `createdAt`. No `limit` returns every visit. */
  listByVehicle(vehicleId: string, limit?: number): Promise<ServiceVisitRecord[]>;
  /** Every visit of these vehicles, newest `serviceDate` first, then newest `createdAt`. */
  listByVehicles(vehicleIds: string[]): Promise<ServiceVisitRecord[]>;
  /** The visit only if it belongs to the vehicle. */
  findForVehicle(id: string, vehicleId: string): Promise<ServiceVisitRecord | null>;
  create(visit: NewServiceVisit): Promise<ServiceVisitRecord>;
  /** `lineItems`, when given, replaces the whole list. */
  update(id: string, changes: ServiceVisitChanges): Promise<ServiceVisitRecord>;
  delete(id: string): Promise<void>;
  /** Deletes every visit of the vehicle and returns their ids (so invoices can go too). */
  deleteByVehicle(vehicleId: string): Promise<string[]>;
}

export class PrismaServiceVisitRepository implements ServiceVisitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByVehicle(vehicleId: string, limit?: number): Promise<ServiceVisitRecord[]> {
    return this.prisma.serviceVisit.findMany({
      where: { vehicleId },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  listByVehicles(vehicleIds: string[]): Promise<ServiceVisitRecord[]> {
    return this.prisma.serviceVisit.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findForVehicle(id: string, vehicleId: string): Promise<ServiceVisitRecord | null> {
    return this.prisma.serviceVisit.findFirst({ where: { id, vehicleId } });
  }

  create(visit: NewServiceVisit): Promise<ServiceVisitRecord> {
    return this.prisma.serviceVisit.create({ data: visit });
  }

  update(id: string, changes: ServiceVisitChanges): Promise<ServiceVisitRecord> {
    return this.prisma.serviceVisit.update({ where: { id }, data: changes });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.serviceVisit.delete({ where: { id } });
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const visits = await this.prisma.serviceVisit.findMany({
      where: { vehicleId },
      select: { id: true },
    });
    await this.prisma.serviceVisit.deleteMany({ where: { vehicleId } });
    return visits.map((visit) => visit.id);
  }
}
