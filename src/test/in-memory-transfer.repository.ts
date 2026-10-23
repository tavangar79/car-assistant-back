import { randomBytes } from 'node:crypto';
import type { TransferRepository } from '../modules/transfers/transfer.repository.ts';
import type {
  NewTransfer,
  TransferRecord,
  TransferStatus,
} from '../modules/transfers/transfer.types.ts';

export class InMemoryTransferRepository implements TransferRepository {
  readonly transfers = new Map<string, TransferRecord>();
  /** Each create is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async create(input: NewTransfer): Promise<TransferRecord> {
    const transfer: TransferRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      status: 'pending',
      createdAt: new Date(this.clock++),
      respondedAt: null,
    };
    this.transfers.set(transfer.id, transfer);
    return transfer;
  }

  async findById(id: string): Promise<TransferRecord | null> {
    return this.transfers.get(id) ?? null;
  }

  async findPendingByVehicle(vehicleId: string): Promise<TransferRecord | null> {
    return this.pending((t) => t.vehicleId === vehicleId)[0] ?? null;
  }

  async listPendingTo(toPhone: string): Promise<TransferRecord[]> {
    return this.pending((t) => t.toPhone === toPhone);
  }

  async listPendingFrom(fromUserId: string): Promise<TransferRecord[]> {
    return this.pending((t) => t.fromUserId === fromUserId);
  }

  async close(id: string, status: Exclude<TransferStatus, 'pending'>, at: Date): Promise<void> {
    const existing = this.transfers.get(id);
    if (!existing) throw new Error(`Transfer ${id} not found`);
    this.transfers.set(id, { ...existing, status, respondedAt: at });
  }

  private pending(match: (transfer: TransferRecord) => boolean): TransferRecord[] {
    return [...this.transfers.values()]
      .filter((transfer) => transfer.status === 'pending' && match(transfer))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
