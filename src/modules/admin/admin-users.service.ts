import { NotFoundError } from '../../shared/errors.ts';
import type { User } from '../auth/auth.types.ts';
import type { UserRepository } from '../auth/user.repository.ts';
import {
  toAdminUser,
  toPage,
  type AdminUpdateUserInput,
  type AdminUser,
  type Page,
} from './admin.types.ts';
import { findCollection, toDocument, type CollectionName, type Row } from './collection-browser.ts';
import type { CollectionRepository } from './collection.repository.ts';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** The record collections counted per vehicle on the user detail screen. */
const VEHICLE_RECORDS = {
  serviceVisits: 'service_visits',
  fuelLogs: 'fuel_logs',
  expenses: 'expenses',
  odometerReadings: 'odometer_readings',
  documents: 'vehicle_documents',
} as const satisfies Record<string, CollectionName>;

type VehicleRecordCounts = Record<keyof typeof VEHICLE_RECORDS, number>;

export interface AdminUserDetail {
  user: AdminUser;
  vehicles: (Row & { counts: VehicleRecordCounts })[];
  transfers: Row[];
  notificationCount: number;
}

export interface AdminUsersServiceDeps {
  users: UserRepository;
  collections: CollectionRepository;
  now: () => Date;
  log: (line: string) => void;
}

const shown = (name: CollectionName) => (row: Row) => toDocument(findCollection(name)!, row);

/** Admin view of users: list, detail, profile edit, block / unblock. Never writes anything else. */
export class AdminUsersService {
  constructor(private readonly deps: AdminUsersServiceDeps) {}

  async list(query: { search?: string; cursor?: string; limit: number }): Promise<Page<AdminUser>> {
    const rows = await this.deps.users.list({ ...query, limit: query.limit + 1 });
    const page = toPage(rows, query.limit);
    return { ...page, items: await Promise.all(page.items.map((user) => this.toAdminUser(user))) };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const { collections } = this.deps;
    const user = await this.findUser(id);
    const vehicles = await collections.find('vehicles', { filter: { userId: user.id } });
    const [withCounts, sent, received, notificationCount] = await Promise.all([
      Promise.all(
        vehicles.map(async (vehicle) => ({
          ...shown('vehicles')(vehicle),
          counts: await this.countRecords(vehicle.id as string),
        })),
      ),
      collections.find('vehicle_transfers', { filter: { fromUserId: user.id } }),
      collections.find('vehicle_transfers', { filter: { toPhone: user.phone } }),
      collections.count('notifications', { userId: user.id }),
    ]);

    // A transfer to the user's own phone appears in both lists; keep it once, newest id first.
    const transfers = [
      ...new Map([...sent, ...received].map((row) => [row.id as string, row])).values(),
    ]
      .sort((a, b) => ((a.id as string) < (b.id as string) ? 1 : -1))
      .map(shown('vehicle_transfers'));

    return {
      user: toAdminUser(user, vehicles.length),
      vehicles: withCounts,
      transfers,
      notificationCount,
    };
  }

  async update(id: string, changes: AdminUpdateUserInput): Promise<AdminUser> {
    const user = await this.findUser(id);
    const updated = await this.deps.users.updateProfile(user.id, changes);
    this.deps.log(
      `admin edited user id=${user.id} fields=${Object.keys(definedOnly(changes)).join(',')}`,
    );
    return this.toAdminUser(updated);
  }

  /** Repeating a block keeps the original `blockedAt` and replaces the reason. */
  async block(id: string, reason: string | null): Promise<AdminUser> {
    const user = await this.findUser(id);
    const updated = await this.deps.users.setBlock(user.id, {
      blockedAt: user.blockedAt ?? this.deps.now(),
      blockReason: reason,
    });
    this.deps.log(`admin blocked user id=${user.id}`);
    return this.toAdminUser(updated);
  }

  async unblock(id: string): Promise<AdminUser> {
    const user = await this.findUser(id);
    const updated = await this.deps.users.setBlock(user.id, { blockedAt: null, blockReason: null });
    this.deps.log(`admin unblocked user id=${user.id}`);
    return this.toAdminUser(updated);
  }

  private async countRecords(vehicleId: string): Promise<VehicleRecordCounts> {
    const entries = await Promise.all(
      Object.entries(VEHICLE_RECORDS).map(
        async ([key, name]) =>
          [key, await this.deps.collections.count(name, { vehicleId })] as const,
      ),
    );
    return Object.fromEntries(entries) as VehicleRecordCounts;
  }

  private async toAdminUser(user: User): Promise<AdminUser> {
    return toAdminUser(user, await this.deps.collections.count('vehicles', { userId: user.id }));
  }

  /** 404 for an unknown or malformed id. */
  private async findUser(id: string): Promise<User> {
    const user = OBJECT_ID_PATTERN.test(id) ? await this.deps.users.findById(id) : null;
    if (!user) throw new NotFoundError('User');
    return user;
  }
}

function definedOnly(changes: AdminUpdateUserInput): Partial<AdminUpdateUserInput> {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
}
