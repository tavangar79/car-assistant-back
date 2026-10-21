import type { DocumentRepository } from '../documents/document.repository.ts';
import type { ServiceVisitRepository } from '../service-visits/service-visit.repository.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';

export interface ProfileServiceDeps {
  vehicles: VehicleService;
  visits: ServiceVisitRepository;
  documents: DocumentRepository;
}

export interface ProfileStats {
  vehicleCount: number;
  /** Service visits across every vehicle of the user. */
  serviceCount: number;
  /** Documents across every vehicle of the user. */
  documentCount: number;
}

/** Counters for the profile screen's stat tiles. */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  async stats(userId: string): Promise<ProfileStats> {
    const vehicleIds = (await this.deps.vehicles.list(userId)).map((vehicle) => vehicle.id);
    return {
      vehicleCount: vehicleIds.length,
      serviceCount: await this.deps.visits.countByVehicles(vehicleIds),
      documentCount: await this.deps.documents.countByVehicles(vehicleIds),
    };
  }
}
