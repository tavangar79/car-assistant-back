import type { PrismaClient } from '@prisma/client';
import type { NewTransfer, TransferRecord, TransferStatus } from './transfer.types.ts';

export interface TransferRepository {
  /** Creates a `pending` transfer. */
  create(transfer: NewTransfer): Promise<TransferRecord>;
  findById(id: string): Promise<TransferRecord | null>;
  findPendingByVehicle(vehicleId: string): Promise<TransferRecord | null>;
  /** Pending transfers to this phone, newest first. */
  listPendingTo(toPhone: string): Promise<TransferRecord[]>;
  /** Pending transfers from this user, newest first. */
  listPendingFrom(fromUserId: string): Promise<TransferRecord[]>;
  /** Closes a transfer (`respondedAt` = `at`). */
  close(id: string, status: Exclude<TransferStatus, 'pending'>, at: Date): Promise<void>;
}

type Row = Omit<TransferRecord, 'status'> & { status: string };

// `status` is a plain string in MongoDB; only this repository writes it.
const toRecord = (row: Row): TransferRecord => ({ ...row, status: row.status as TransferStatus });

const NEWEST_FIRST = { createdAt: 'desc' } as const;

export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(transfer: NewTransfer): Promise<TransferRecord> {
    return toRecord(
      await this.prisma.vehicleTransfer.create({ data: { ...transfer, status: 'pending' } }),
    );
  }

  async findById(id: string): Promise<TransferRecord | null> {
    const row = await this.prisma.vehicleTransfer.findUnique({ where: { id } });
    return row && toRecord(row);
  }

  async findPendingByVehicle(vehicleId: string): Promise<TransferRecord | null> {
    const row = await this.prisma.vehicleTransfer.findFirst({
      where: { vehicleId, status: 'pending' },
    });
    return row && toRecord(row);
  }

  async listPendingTo(toPhone: string): Promise<TransferRecord[]> {
    const rows = await this.prisma.vehicleTransfer.findMany({
      where: { toPhone, status: 'pending' },
      orderBy: NEWEST_FIRST,
    });
    return rows.map(toRecord);
  }

  async listPendingFrom(fromUserId: string): Promise<TransferRecord[]> {
    const rows = await this.prisma.vehicleTransfer.findMany({
      where: { fromUserId, status: 'pending' },
      orderBy: NEWEST_FIRST,
    });
    return rows.map(toRecord);
  }

  async close(id: string, status: Exclude<TransferStatus, 'pending'>, at: Date): Promise<void> {
    await this.prisma.vehicleTransfer.update({ where: { id }, data: { status, respondedAt: at } });
  }
}
