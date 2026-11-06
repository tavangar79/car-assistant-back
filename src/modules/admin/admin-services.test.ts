import { describe, expect, it } from 'vitest';
import { InMemoryCollectionRepository } from '../../test/in-memory-collection.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { AdminStatsService } from './admin-stats.service.ts';
import { AdminUsersService } from './admin-users.service.ts';
import { CollectionBrowserService } from './collection-browser.service.ts';

const ALICE = 'a00000000000000000000001';
const NOW = new Date('2026-11-06T10:00:00Z');

describe('AdminUsersService', () => {
  const setup = () => {
    const users = new InMemoryUserRepository([{ id: ALICE, phone: '09120000001' }]);
    const collections = new InMemoryCollectionRepository({
      vehicle_transfers: [
        // A transfer to the user's own phone matches both queries; it must appear once.
        { id: 'e00000000000000000000001', fromUserId: ALICE, toPhone: '09120000001' },
      ],
    });
    const logs: string[] = [];
    const service = new AdminUsersService({
      users,
      collections,
      now: () => NOW,
      log: (l) => logs.push(l),
    });
    return { users, service, logs };
  };

  it('lists a page with nextCursor', async () => {
    const { service } = setup();

    expect(await service.list({ limit: 1 })).toMatchObject({
      items: [{ id: ALICE }],
      nextCursor: null,
    });
  });

  it('lists each transfer once in the detail', async () => {
    const { service } = setup();

    expect((await service.detail(ALICE)).transfers).toHaveLength(1);
  });

  it('keeps the first blockedAt when blocking again', async () => {
    const { service } = setup();
    await service.block(ALICE, 'a');

    const again = await service.block(ALICE, 'b');

    expect(again).toMatchObject({ blockedAt: NOW, blockReason: 'b' });
  });

  it('unblocks and edits, logging each with the target id', async () => {
    const { service, logs } = setup();
    await service.block(ALICE, null);

    expect(await service.unblock(ALICE)).toMatchObject({ blockedAt: null, blockReason: null });
    expect(await service.update(ALICE, { lastName: 'Rezaei' })).toMatchObject({
      lastName: 'Rezaei',
    });
    expect(logs).toEqual([
      `admin blocked user id=${ALICE}`,
      `admin unblocked user id=${ALICE}`,
      `admin edited user id=${ALICE} fields=lastName`,
    ]);
  });

  it.each(['ffffffffffffffffffffffff', 'bad'])('throws 404 for %s', async (id) => {
    const { service } = setup();

    await expect(service.detail(id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.block(id, null)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('CollectionBrowserService', () => {
  const service = new CollectionBrowserService(
    new InMemoryCollectionRepository({
      expenses: [{ id: 'c1', vehicleId: 'v1', amount: 10, data: 'leak' }],
    }),
  );

  it('counts every registered collection', async () => {
    expect(await service.list()).toContainEqual({ name: 'expenses', count: 1 });
  });

  it('returns only the registered fields', async () => {
    const result = await service.browse('expenses', { limit: 25 });

    expect(result.documents[0]).toMatchObject({ id: 'c1', amount: 10, title: null });
    expect(result.documents[0]).not.toHaveProperty('data');
  });

  it('throws 404 for an excluded collection and 400 for a missing filter field', async () => {
    await expect(service.browse('admins', { limit: 25 })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.browse('expenses', { limit: 25, userId: ALICE })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('AdminStatsService', () => {
  it('defaults to the 30 Tehran days ending today', async () => {
    const service = new AdminStatsService({
      collections: new InMemoryCollectionRepository(),
      users: new InMemoryUserRepository(),
      now: () => new Date('2026-11-05T21:00:00Z'), // already 2026-11-06 in Tehran
    });

    const stats = await service.stats({ bucket: 'day' });

    expect(stats.range).toEqual({ from: '2026-10-08', to: '2026-11-06', bucket: 'day' });
    expect(stats.series).toHaveLength(30);
  });

  it('uses 30 days back from a given `to`, and rejects from > to', async () => {
    const service = new AdminStatsService({
      collections: new InMemoryCollectionRepository(),
      users: new InMemoryUserRepository(),
      now: () => NOW,
    });

    expect((await service.stats({ to: '2026-01-30', bucket: 'day' })).range.from).toBe(
      '2026-01-01',
    );
    await expect(
      service.stats({ from: '2026-02-01', to: '2026-01-01', bucket: 'day' }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
