import { beforeEach, describe, expect, it } from 'vitest';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { ProfileService } from './profile.service.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');

describe('ProfileService.stats', () => {
  let garage: Garage;
  let service: ProfileService;

  beforeEach(() => {
    garage = createGarage(NOW);
    service = new ProfileService({
      vehicles: garage.vehicleService,
      visits: garage.repositories.serviceVisitRepository,
      documents: garage.repositories.documentRepository,
    });
  });

  it('is zero for a new user', async () => {
    expect(await service.stats(ALICE)).toEqual({
      vehicleCount: 0,
      serviceCount: 0,
      documentCount: 0,
    });
  });

  it("counts the user's vehicles, their service visits and documents only", async () => {
    const first = await garage.addVehicle(ALICE, '345');
    const second = await garage.addVehicle(ALICE, '346');
    const bobs = await garage.addVehicle(BOB, '999');
    await garage.addService(first, '2026-01-01T08:00:00Z', { battery: 1 });
    await garage.addService(second, '2026-02-01T08:00:00Z', { battery: 1 });
    await garage.addService(second, '2026-03-01T08:00:00Z', { battery: 1 });
    await garage.addService(bobs, '2026-03-01T08:00:00Z', { battery: 1 });
    await garage.addFuel(first, '2026-03-01T08:00:00Z');
    await garage.addDocument(first);
    await garage.addDocument(second);
    await garage.addDocument(second);
    await garage.addDocument(bobs);

    expect(await service.stats(ALICE)).toEqual({
      vehicleCount: 2,
      serviceCount: 3,
      documentCount: 3,
    });
  });
});
