import { randomBytes } from 'node:crypto';
import type { ServiceVisitRepository } from '../modules/service-visits/service-visit.repository.ts';
import type {
  NewServiceVisit,
  ServiceVisitChanges,
  ServiceVisitRecord,
} from '../modules/service-visits/service-visit.types.ts';

export class InMemoryServiceVisitRepository implements ServiceVisitRepository {
  readonly visits = new Map<string, ServiceVisitRecord>();
  /** Each write is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async listByVehicle(vehicleId: string, limit?: number): Promise<ServiceVisitRecord[]> {
    const visits = await this.listByVehicles([vehicleId]);
    return limit === undefined ? visits : visits.slice(0, limit);
  }

  async listByVehicles(vehicleIds: string[]): Promise<ServiceVisitRecord[]> {
    return [...this.visits.values()]
      .filter((visit) => vehicleIds.includes(visit.vehicleId))
      .sort(
        (a, b) =>
          b.serviceDate.getTime() - a.serviceDate.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }

  async findForVehicle(id: string, vehicleId: string): Promise<ServiceVisitRecord | null> {
    const visit = this.visits.get(id);
    return visit?.vehicleId === vehicleId ? visit : null;
  }

  async create(input: NewServiceVisit): Promise<ServiceVisitRecord> {
    const now = new Date(this.clock++);
    const visit: ServiceVisitRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.visits.set(visit.id, visit);
    return visit;
  }

  async update(id: string, changes: ServiceVisitChanges): Promise<ServiceVisitRecord> {
    const existing = this.visits.get(id);
    if (!existing) throw new Error(`Service visit ${id} not found`);
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: ServiceVisitRecord = {
      ...existing,
      ...defined,
      updatedAt: new Date(this.clock++),
    };
    this.visits.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.visits.delete(id);
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const ids = (await this.listByVehicle(vehicleId)).map((visit) => visit.id);
    for (const id of ids) this.visits.delete(id);
    return ids;
  }
}
