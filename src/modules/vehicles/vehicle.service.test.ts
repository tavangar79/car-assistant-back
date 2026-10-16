import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../shared/errors.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';
import { VehicleService } from './vehicle.service.ts';

describe('VehicleService', () => {
  let service: VehicleService;

  beforeEach(() => {
    service = new VehicleService(new InMemoryVehicleRepository());
  });

  it('creates and returns a vehicle', async () => {
    const created = await service.create({ make: 'Toyota', model: 'Corolla', year: 2020, mileageKm: 0 });

    expect(await service.getById(created.id)).toEqual(created);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(service.getById('000000000000000000000000')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for a malformed id', async () => {
    await expect(service.getById('not-an-id')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates only the given fields', async () => {
    const created = await service.create({ make: 'Honda', model: 'Civic', year: 2018, mileageKm: 1000 });

    const updated = await service.update(created.id, { mileageKm: 2500 });

    expect(updated).toMatchObject({ make: 'Honda', model: 'Civic', mileageKm: 2500 });
  });

  it('removes a vehicle', async () => {
    const created = await service.create({ make: 'Kia', model: 'Rio', year: 2021, mileageKm: 0 });

    await service.remove(created.id);

    expect(await service.list()).toEqual([]);
  });
});
