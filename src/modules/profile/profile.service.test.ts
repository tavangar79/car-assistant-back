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
    });
  });

  it('is zero for a new user', async () => {
    expect(await service.stats(ALICE)).toEqual({ vehicleCount: 0, serviceCount: 0 });
  });

  it("counts the user's vehicles and their service visits only", async () => {
    const first = await garage.addVehicle(ALICE, '345');
    const second = await garage.addVehicle(ALICE, '346');
    const bobs = await garage.addVehicle(BOB, '999');
    await garage.addService(first, '2026-01-01T08:00:00Z', { battery: 1 });
    await garage.addService(second, '2026-02-01T08:00:00Z', { battery: 1 });
    await garage.addService(second, '2026-03-01T08:00:00Z', { battery: 1 });
    await garage.addService(bobs, '2026-03-01T08:00:00Z', { battery: 1 });
    await garage.addFuel(first, '2026-03-01T08:00:00Z');

    expect(await service.stats(ALICE)).toEqual({ vehicleCount: 2, serviceCount: 3 });
  });
});
