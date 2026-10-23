import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../shared/errors.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { InMemoryTransferRepository } from '../../test/in-memory-transfer.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import type { User } from '../auth/auth.types.ts';
import type { NewNotification } from '../notifications/notification.types.ts';
import { BUYER_HAS_PLATE, SELF_TRANSFER, TransferService } from './transfer.service.ts';

const NOW = new Date('2026-10-17T10:00:00Z');
const SELLER_PHONE = '09120000001';
const BUYER_PHONE = '09120000002';
const MISSING = 'cccccccccccccccccccccccc';

const notification = (userId: string, vehicleId: string, key: string): NewNotification => ({
  userId,
  vehicleId,
  key,
  kind: 'document_expiry',
  refId: key,
  subject: 'بیمه',
  dueKm: null,
  remainingKm: null,
  mileageKm: null,
  expiresAt: null,
  thresholdDays: 30,
  createdAt: NOW,
});

describe('TransferService', () => {
  let garage: Garage;
  let users: InMemoryUserRepository;
  let transfers: InMemoryTransferRepository;
  let service: TransferService;
  let seller: User;
  let buyer: User;
  let car: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    users = new InMemoryUserRepository();
    transfers = new InMemoryTransferRepository();
    const r = garage.repositories;
    service = new TransferService({
      transfers,
      vehicleRecords: r.vehicleRepository,
      vehicles: garage.vehicleService,
      users,
      documents: r.documentRepository,
      documentFiles: r.documentFileRepository,
      notifications: r.notificationRepository,
      now: () => NOW,
    });
    seller = await users.updateProfile((await users.create(SELLER_PHONE)).id, {
      firstName: 'علی',
      lastName: 'رضایی',
      birthDate: new Date('1990-01-01T00:00:00Z'),
    });
    buyer = await users.create(BUYER_PHONE);
    car = await garage.addVehicle(seller.id, '345', 42300);
  });

  const vehicle = (id = car) => garage.repositories.vehicleRepository.vehicles.get(id)!;

  describe('create', () => {
    it('creates a pending transfer with the vehicle snapshot and the seller name', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      expect(transfer).toEqual({
        id: expect.any(String),
        vehicleId: car,
        toPhone: BUYER_PHONE,
        status: 'pending',
        createdAt: expect.any(Date),
        respondedAt: null,
        vehicle: {
          nickname: 'تارا',
          makeId: 'iran-khodro',
          modelId: 'tara',
          trimId: null,
          yearJalali: 1402,
          plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
          mileageKm: 42300,
        },
        fromName: 'علی رضایی',
      });
    });

    it('accepts a phone that has no account yet', async () => {
      const transfer = await service.create(seller.id, car, '09359999999');
      expect(transfer.toPhone).toBe('09359999999');
    });

    it('rejects the seller’s own phone with 422 details.phone', async () => {
      await expect(service.create(seller.id, car, SELLER_PHONE)).rejects.toMatchObject({
        statusCode: 422,
        details: { phone: [SELF_TRANSFER] },
      });
    });

    it('rejects a second pending transfer of the vehicle with 409', async () => {
      await service.create(seller.id, car, BUYER_PHONE);
      await expect(service.create(seller.id, car, '09359999999')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('allows a new transfer once the previous one is closed', async () => {
      const first = await service.create(seller.id, car, BUYER_PHONE);
      await service.cancel(seller.id, first.id);
      await expect(service.create(seller.id, car, BUYER_PHONE)).resolves.toBeDefined();
    });

    it('rejects another user’s vehicle as not found', async () => {
      await expect(service.create(buyer.id, car, SELLER_PHONE)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('shows pending transfers as incoming to the buyer and outgoing from the seller', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      expect(await service.list(buyer.id)).toEqual({ incoming: [transfer], outgoing: [] });
      expect(await service.list(seller.id)).toEqual({ incoming: [], outgoing: [transfer] });
    });

    it('lists newest first and leaves out closed transfers', async () => {
      const other = await garage.addVehicle(seller.id, '999');
      const third = await garage.addVehicle(seller.id, '888');
      const older = await service.create(seller.id, car, BUYER_PHONE);
      const newer = await service.create(seller.id, other, BUYER_PHONE);
      const rejected = await service.create(seller.id, third, BUYER_PHONE);
      await service.reject(buyer.id, rejected.id);

      const { incoming } = await service.list(buyer.id);

      expect(incoming.map((t) => t.id)).toEqual([newer.id, older.id]);
    });

    it('gives a null fromName when the seller has no name', async () => {
      const nameless = await users.create('09350000000');
      const nCar = await garage.addVehicle(nameless.id);
      await service.create(nameless.id, nCar, BUYER_PHONE);

      const [transfer] = (await service.list(buyer.id)).incoming;

      expect(transfer!.fromName).toBeNull();
    });

    it('cancels and leaves out a transfer whose vehicle was deleted', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await garage.vehicleService.remove(seller.id, car);

      expect(await service.list(buyer.id)).toEqual({ incoming: [], outgoing: [] });
      expect(transfers.transfers.get(transfer.id)!.status).toBe('cancelled');
    });
  });

  describe('cancel and reject', () => {
    it('lets the seller cancel', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await service.cancel(seller.id, transfer.id);
      expect(transfers.transfers.get(transfer.id)).toMatchObject({
        status: 'cancelled',
        respondedAt: NOW,
      });
    });

    it('does not let the buyer cancel', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await expect(service.cancel(buyer.id, transfer.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lets the buyer reject', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await service.reject(buyer.id, transfer.id);
      expect(transfers.transfers.get(transfer.id)).toMatchObject({
        status: 'rejected',
        respondedAt: NOW,
      });
    });

    it('does not let the seller reject or accept', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await expect(service.reject(seller.id, transfer.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.accept(seller.id, transfer.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('treats closed, unknown and malformed ids as not found', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await service.reject(buyer.id, transfer.id);
      await expect(service.accept(buyer.id, transfer.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.cancel(seller.id, transfer.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.reject(buyer.id, MISSING)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.cancel(seller.id, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('accept', () => {
    it('moves the vehicle to the buyer as default when it is their first (effect 1)', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      const accepted = await service.accept(buyer.id, transfer.id);

      expect(accepted).toMatchObject({ id: car, isDefault: true, ownedSince: NOW });
      expect(vehicle()).toMatchObject({ userId: buyer.id, ownedSince: NOW, isDefault: true });
    });

    it('does not make it default when the buyer already has a vehicle (effect 1)', async () => {
      await garage.addVehicle(buyer.id, '111');
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect(vehicle().isDefault).toBe(false);
    });

    it('makes the seller’s most recently created vehicle default (effect 2)', async () => {
      const older = await garage.addVehicle(seller.id, '111');
      const newest = await garage.addVehicle(seller.id, '222');
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect(vehicle(newest).isDefault).toBe(true);
      expect(vehicle(older).isDefault).toBe(false);
    });

    it('keeps the seller’s default when the moved vehicle was not it (effect 2)', async () => {
      const other = await garage.addVehicle(seller.id, '111');
      const transfer = await service.create(seller.id, other, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect(vehicle(car).isDefault).toBe(true);
    });

    it('deletes identity documents and their files but keeps insurance and inspection (effect 3)', async () => {
      const { documentRepository, documentFileRepository } = garage.repositories;
      const card = await garage.addDocument(car, { type: 'vehicle_card' });
      const green = await garage.addDocument(car, { type: 'green_sheet' });
      const poa = await garage.addDocument(car, { type: 'power_of_attorney' });
      const insurance = await garage.addDocument(car, { type: 'third_party_insurance' });
      const inspection = await garage.addDocument(car, { type: 'inspection' });
      const file = { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1 };
      await documentFileRepository.create({ ...file, documentId: card, data: new Uint8Array(1) });
      const kept = await documentFileRepository.create({
        ...file,
        documentId: insurance,
        data: new Uint8Array(1),
      });
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect([...documentRepository.documents.keys()].sort()).toEqual(
        [insurance, inspection].sort(),
      );
      expect([...documentFileRepository.files.keys()]).toEqual([kept.id]);
      expect([card, green, poa].some((id) => documentRepository.documents.has(id))).toBe(false);
    });

    it('deletes the vehicle’s notifications only (effect 4)', async () => {
      const other = await garage.addVehicle(seller.id, '111');
      const { notificationRepository } = garage.repositories;
      await notificationRepository.createMany([
        notification(seller.id, car, 'a'),
        notification(seller.id, other, 'b'),
      ]);
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect([...notificationRepository.notifications.values()].map((n) => n.key)).toEqual(['b']);
    });

    it('marks the transfer accepted (effect 5) and keeps records on the vehicle', async () => {
      const serviceId = await garage.addService(car, '2026-01-10T08:00:00Z', { engine_oil: 1 });
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await service.accept(buyer.id, transfer.id);

      expect(transfers.transfers.get(transfer.id)).toMatchObject({
        status: 'accepted',
        respondedAt: NOW,
      });
      expect(garage.repositories.serviceVisitRepository.visits.get(serviceId)!.vehicleId).toBe(car);
      expect(await service.list(buyer.id)).toEqual({ incoming: [], outgoing: [] });
    });

    it('completes a retry after the vehicle already moved (idempotent)', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      const earlier = new Date('2026-10-17T09:00:00Z');
      // Simulates a crash right after effect 1.
      await garage.repositories.vehicleRepository.changeOwner(car, {
        userId: buyer.id,
        ownedSince: earlier,
        isDefault: true,
      });
      await garage.addDocument(car, { type: 'vehicle_card' });

      const accepted = await service.accept(buyer.id, transfer.id);

      expect(accepted.ownedSince).toEqual(earlier);
      expect(garage.repositories.documentRepository.documents.size).toBe(0);
      expect(transfers.transfers.get(transfer.id)!.status).toBe('accepted');
    });

    it('returns 409 and cancels the transfer when the vehicle was deleted', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      await garage.vehicleService.remove(seller.id, car);

      await expect(service.accept(buyer.id, transfer.id)).rejects.toBeInstanceOf(ConflictError);
      expect(transfers.transfers.get(transfer.id)!.status).toBe('cancelled');
    });

    it('returns 409 and keeps the transfer pending when the buyer has the same plate', async () => {
      await garage.addVehicle(buyer.id, '345');
      const transfer = await service.create(seller.id, car, BUYER_PHONE);

      await expect(service.accept(buyer.id, transfer.id)).rejects.toMatchObject({
        statusCode: 409,
        message: BUYER_HAS_PLATE,
      });
      expect(transfers.transfers.get(transfer.id)!.status).toBe('pending');
      expect(vehicle().userId).toBe(seller.id);
    });

    it('returns 409 when the vehicle now belongs to someone else', async () => {
      const transfer = await service.create(seller.id, car, BUYER_PHONE);
      const third = await users.create('09350000000');
      await garage.repositories.vehicleRepository.changeOwner(car, {
        userId: third.id,
        ownedSince: NOW,
        isDefault: true,
      });

      await expect(service.accept(buyer.id, transfer.id)).rejects.toBeInstanceOf(ConflictError);
      expect(transfers.transfers.get(transfer.id)!.status).toBe('cancelled');
    });
  });
});
