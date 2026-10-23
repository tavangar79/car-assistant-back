import { AppError, ConflictError, NotFoundError } from '../../shared/errors.ts';
import type { User } from '../auth/auth.types.ts';
import type { UserRepository } from '../auth/user.repository.ts';
import type { DocumentFileRepository } from '../documents/document-file.repository.ts';
import type { DocumentRepository } from '../documents/document.repository.ts';
import type { DocumentType } from '../documents/document.types.ts';
import type { NotificationRepository } from '../notifications/notification.repository.ts';
import type { VehicleRepository } from '../vehicles/vehicle.repository.ts';
import { samePlate, type VehicleService } from '../vehicles/vehicle.service.ts';
import type { Vehicle, VehicleRecord } from '../vehicles/vehicle.types.ts';
import type { TransferRepository } from './transfer.repository.ts';
import type { Transfer, TransferList, TransferRecord } from './transfer.types.ts';

export interface TransferServiceDeps {
  transfers: TransferRepository;
  /** Reads any user's vehicle and moves it to the buyer. */
  vehicleRecords: VehicleRepository;
  /** Seller ownership checks (404) and the accepted vehicle's JSON. */
  vehicles: VehicleService;
  users: UserRepository;
  documents: DocumentRepository;
  documentFiles: DocumentFileRepository;
  notifications: NotificationRepository;
  now: () => Date;
}

export const SELF_TRANSFER = 'نمی‌توانید خودرو را به شماره خودتان منتقل کنید';
export const TRANSFER_PENDING = 'A pending transfer already exists for this vehicle';
export const TRANSFER_STALE = 'The vehicle no longer belongs to the seller';
export const BUYER_HAS_PLATE = 'خودرویی با همین پلاک در گاراژ شما وجود دارد';

/** These belong to the seller and are deleted on accept; insurance and inspection move with the car. */
export const IDENTITY_DOCUMENT_TYPES: readonly DocumentType[] = [
  'vehicle_card',
  'green_sheet',
  'power_of_attorney',
];

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const fullName = (user: User | null) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null;

const newestFirst = (a: VehicleRecord, b: VehicleRecord) =>
  b.createdAt.getTime() - a.createdAt.getTime();

/** Ownership transfer: the seller sends a request to a phone; the vehicle moves only when the buyer accepts. */
export class TransferService {
  constructor(private readonly deps: TransferServiceDeps) {}

  /** 404 for another user's vehicle; 422 for the seller's own phone; 409 if one is already pending. */
  async create(userId: string, vehicleId: string, toPhone: string): Promise<Transfer> {
    const { transfers, vehicleRecords, users } = this.deps;
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const seller = await users.findById(userId);
    if (seller?.phone === toPhone) {
      throw new AppError(422, SELF_TRANSFER, { phone: [SELF_TRANSFER] });
    }
    if (await transfers.findPendingByVehicle(vehicle.id)) throw new ConflictError(TRANSFER_PENDING);

    const transfer = await transfers.create({ vehicleId: vehicle.id, fromUserId: userId, toPhone });
    const record = await vehicleRecords.findById(vehicle.id);
    return this.toTransfer(transfer, record!, seller);
  }

  /**
   * Pending transfers to the caller's phone and from the caller. A transfer whose vehicle was deleted
   * or no longer belongs to the seller can never be accepted, so it is cancelled and left out.
   */
  async list(userId: string): Promise<TransferList> {
    const { transfers, users } = this.deps;
    const user = await users.findById(userId);
    const incoming = user ? await transfers.listPendingTo(user.phone) : [];
    const outgoing = await transfers.listPendingFrom(userId);
    return {
      incoming: await this.toCurrentTransfers(incoming),
      outgoing: await this.toCurrentTransfers(outgoing),
    };
  }

  /** The seller withdraws a pending request. */
  async cancel(userId: string, transferId: string): Promise<void> {
    const transfer = await this.findPending(transferId);
    if (transfer.fromUserId !== userId) throw new NotFoundError('Transfer');
    await this.deps.transfers.close(transfer.id, 'cancelled', this.deps.now());
  }

  /** The buyer declines a pending request. */
  async reject(userId: string, transferId: string): Promise<void> {
    const transfer = await this.findIncoming(userId, transferId);
    await this.deps.transfers.close(transfer.id, 'rejected', this.deps.now());
  }

  /**
   * The buyer takes the vehicle. Each step is idempotent, so retrying after a crash is safe:
   * 1. move the vehicle (ownedSince = now; default only if the buyer has no other vehicle),
   * 2. give the seller a default again, 3. delete the identity documents and their files,
   * 4. delete the vehicle's notifications (the seller's), 5. mark the transfer accepted.
   * 409 (and the transfer is cancelled) when the vehicle no longer belongs to the seller.
   * 409 (the transfer stays pending) when the buyer already has a vehicle with the same plate.
   */
  async accept(userId: string, transferId: string): Promise<Vehicle> {
    const { transfers, vehicleRecords, notifications, now } = this.deps;
    const transfer = await this.findIncoming(userId, transferId);
    const vehicle = await vehicleRecords.findById(transfer.vehicleId);
    // Already the buyer's: a retry after step 1 succeeded.
    if (!vehicle || (vehicle.userId !== transfer.fromUserId && vehicle.userId !== userId)) {
      await transfers.close(transfer.id, 'cancelled', now());
      throw new ConflictError(TRANSFER_STALE);
    }

    if (vehicle.userId !== userId) {
      const buyerGarage = await vehicleRecords.listByUser(userId);
      // The transfer stays pending: the buyer can free the plate and accept again.
      if (buyerGarage.some((own) => samePlate(own.plate, vehicle.plate))) {
        throw new ConflictError(BUYER_HAS_PLATE);
      }
      await vehicleRecords.changeOwner(vehicle.id, {
        userId,
        ownedSince: now(),
        isDefault: buyerGarage.length === 0,
      });
    }
    await this.ensureDefault(transfer.fromUserId);
    await this.deleteIdentityDocuments(vehicle.id);
    await notifications.deleteByVehicle(vehicle.id);
    await transfers.close(transfer.id, 'accepted', now());

    return this.deps.vehicles.getById(userId, vehicle.id);
  }

  /** If the seller has vehicles left but none is default, the most recently created one becomes default. */
  private async ensureDefault(sellerId: string): Promise<void> {
    const garage = (await this.deps.vehicleRecords.listByUser(sellerId)).sort(newestFirst);
    if (garage.length > 0 && !garage.some((vehicle) => vehicle.isDefault)) {
      await this.deps.vehicleRecords.makeDefault(sellerId, garage[0]!.id);
    }
  }

  /** Files first, so a retry still finds the documents whose files are left. */
  private async deleteIdentityDocuments(vehicleId: string): Promise<void> {
    const { documents, documentFiles } = this.deps;
    const ids = (await documents.listByVehicles([vehicleId]))
      .filter((document) => IDENTITY_DOCUMENT_TYPES.includes(document.type as DocumentType))
      .map((document) => document.id);
    await documentFiles.deleteByDocumentIds(ids);
    for (const id of ids) await documents.delete(id);
  }

  /** 404 for a malformed or unknown id, or a transfer that is no longer pending. */
  private async findPending(transferId: string): Promise<TransferRecord> {
    const transfer = OBJECT_ID_PATTERN.test(transferId)
      ? await this.deps.transfers.findById(transferId)
      : null;
    if (transfer?.status !== 'pending') throw new NotFoundError('Transfer');
    return transfer;
  }

  /** `findPending`, and it must be addressed to the caller's phone. */
  private async findIncoming(userId: string, transferId: string): Promise<TransferRecord> {
    const transfer = await this.findPending(transferId);
    const user = await this.deps.users.findById(userId);
    if (!user || transfer.toPhone !== user.phone) throw new NotFoundError('Transfer');
    return transfer;
  }

  private async toCurrentTransfers(records: TransferRecord[]): Promise<Transfer[]> {
    const { vehicleRecords, users, transfers, now } = this.deps;
    const result: Transfer[] = [];
    for (const transfer of records) {
      const vehicle = await vehicleRecords.findById(transfer.vehicleId);
      if (vehicle?.userId !== transfer.fromUserId) {
        await transfers.close(transfer.id, 'cancelled', now());
        continue;
      }
      result.push(this.toTransfer(transfer, vehicle, await users.findById(transfer.fromUserId)));
    }
    return result;
  }

  private toTransfer(
    transfer: TransferRecord,
    vehicle: VehicleRecord,
    seller: User | null,
  ): Transfer {
    return {
      id: transfer.id,
      vehicleId: transfer.vehicleId,
      toPhone: transfer.toPhone,
      status: transfer.status,
      createdAt: transfer.createdAt,
      respondedAt: transfer.respondedAt,
      vehicle: {
        nickname: vehicle.nickname,
        makeId: vehicle.makeId,
        modelId: vehicle.modelId,
        trimId: vehicle.trimId,
        yearJalali: vehicle.yearJalali,
        plate: vehicle.plate,
        mileageKm: vehicle.mileageKm,
      },
      fromName: fullName(seller),
    };
  }
}
