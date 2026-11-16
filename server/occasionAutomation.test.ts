import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { occasionGrantKey } from '@shared/occasionCouponPolicy';

/** No database connection, provider client, or real customer fixture is loaded. */
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  send: vi.fn(),
  preflight: vi.fn(),
}));

vi.mock('./db', () => ({ getDb: mocks.getDb }));
vi.mock('./occasionNotification', () => ({ sendOccasionNotice: mocks.send }));
vi.mock('./occasionSmsPreflight', () => ({ occasionSmsPreflight: mocks.preflight }));

// A small symbolic Drizzle contract lets the memory DB evaluate the actual
// service predicates, rather than returning a scripted sequence of canned rows.
vi.mock('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ kind: 'eq', left, right }),
  and: (...conditions: unknown[]) => ({ kind: 'and', conditions }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    kind: 'sql', text: strings.join('?'), values,
  }),
}));
vi.mock('../drizzle/schema', () => {
  const table = (name: string, keys: string[]) => Object.fromEntries([
    ['__name', name],
    ...keys.map(key => [key, { table: name, key }]),
  ]);
  return {
    members: table('members', ['id', 'status', 'marketingConsent', 'phone', 'birthDate', 'anniversaryDate']),
    coupons: table('coupons', ['id', 'memberId', 'type', 'code']),
    couponTemplates: table('couponTemplates', ['id', 'type', 'isActive']),
    consentLogs: table('consentLogs', ['id', 'memberId', 'consentType', 'createdAt']),
    occasionAutomationSettings: table('occasionAutomationSettings', ['key']),
    occasionNotifications: table('occasionNotifications', ['id', 'memberId', 'type', 'occasionYear', 'channel', 'status', 'scheduledDate']),
  };
});

import {
  dispatchOccasionNotifications,
  legacyOccasionYear,
  OCCASION_SETTINGS_KEY,
  queueMemberOccasions,
  sameOccasionYear,
} from './occasionAutomation';

type Row = Record<string, any>;
type TableName = 'members' | 'coupons' | 'couponTemplates' | 'consentLogs' |
  'occasionAutomationSettings' | 'occasionNotifications';
type Column = { table: TableName; key: string };
type Predicate =
  | { kind: 'eq'; left: Column; right: unknown }
  | { kind: 'and'; conditions: Predicate[] }
  | { kind: 'sql'; text: string; values: any[] };
type Event = { kind: string; table?: TableName; data?: Row; text?: string };

const NOW = new Date('2026-12-16T01:00:00.000Z'); // 10:00 KST, exactly D-30 for January 15.
const MEMBER_ID = 900001;
const SECRET = 'fake-private-test-secret-not-production';
const EMPTY_SUMMARY = { accepted: 0, failed: 0, unknown: 0, blocked: 0, cancelled: 0, remaining: 0 };
const dayKey = (value: Date | string) => value instanceof Date
  ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const hash = (value: string) => createHmac('sha256', SECRET).update(value).digest('hex');

function matches(row: Row, predicate?: Predicate): boolean {
  if (!predicate) return true;
  if (predicate.kind === 'eq') return row[predicate.left.key] === predicate.right;
  if (predicate.kind === 'and') return predicate.conditions.every(condition => matches(row, condition));
  if (predicate.text.includes("IN ('marketing','marketing_withdraw')")) {
    return ['marketing', 'marketing_withdraw'].includes(row.consentType);
  }
  if (predicate.text.includes('REGEXP_REPLACE')) {
    return row.phone.replace(/\D/g, '') === predicate.values.at(-1);
  }
  if (predicate.text.includes('<=')) {
    return dayKey(row[predicate.values[0].key]) <= predicate.values[1];
  }
  throw new Error(`Unimplemented SQL predicate: ${predicate.text}`);
}

function memoryDb(tables: Record<TableName, Row[]>) {
  const events: Event[] = [];
  const select = vi.fn((projection?: Record<string, Column>) => {
    let table: TableName;
    let predicate: Predicate | undefined;
    let ordering: any[] = [];
    let maximum = Infinity;
    const query: any = {
      from: vi.fn((source: { __name: TableName }) => { table = source.__name; return query; }),
      where: vi.fn((condition: Predicate) => { predicate = condition; return query; }),
      orderBy: vi.fn((...fields: any[]) => { ordering = fields; return query; }),
      limit: vi.fn((limit: number) => { maximum = limit; return query; }),
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        let rows = tables[table].filter(row => matches(row, predicate));
        if (ordering.length) rows = [...rows].sort((a, b) => {
          for (const field of ordering) {
            const column = field.kind === 'sql' ? field.values[0] : field;
            const descending = field.kind === 'sql' && field.text.includes('DESC');
            const av = a[column.key] instanceof Date ? a[column.key].getTime() : a[column.key];
            const bv = b[column.key] instanceof Date ? b[column.key].getTime() : b[column.key];
            if (av !== bv) return (av < bv ? -1 : 1) * (descending ? -1 : 1);
          }
          return 0;
        });
        rows = rows.slice(0, maximum);
        return rows.map(row => projection
          ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.key]]))
          : { ...row });
      }).then(resolve, reject),
    };
    return query;
  });
  const db: any = {
    select,
    execute: vi.fn(async (statement: { text: string }) => {
      events.push({ kind: 'lock', text: statement.text });
      return [];
    }),
    insert: vi.fn((source: { __name: TableName }) => ({
      values: vi.fn(async (data: Row) => {
        const table = source.__name;
        events.push({ kind: 'insert', table, data: { ...data } });
        tables[table].push({ id: Math.max(0, ...tables[table].map(row => row.id ?? 0)) + 1, ...data });
        return [];
      }),
    })),
    update: vi.fn((source: { __name: TableName }) => ({
      set: vi.fn((data: Row) => ({
        where: vi.fn(async (predicate: Predicate) => {
          events.push({ kind: 'update', table: source.__name, data: { ...data } });
          for (const row of tables[source.__name]) if (matches(row, predicate)) Object.assign(row, data);
          return [];
        }),
      })),
    })),
    transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => {
      events.push({ kind: 'begin' });
      const result = await work(db);
      events.push({ kind: 'commit' });
      return result;
    }),
  };
  return { db, events, tables };
}

function fakeMember(overrides: Row = {}): Row {
  return {
    id: MEMBER_ID, name: '가상 비공개 테스트 고객', status: 'active',
    email: 'fixture.member@example.invalid', phone: '01000000000',
    birthDate: '1990-01-15', anniversaryDate: '2010-01-15',
    marketingConsent: true, marketingConsentAt: new Date('2026-11-01T00:00:00Z'),
    marketingConsentContent: 'FAKE PRIVATE CONSENT FIXTURE ONLY', ...overrides,
  };
}

function fakeCoupon(overrides: Row = {}): Row {
  return {
    id: 800001, memberId: MEMBER_ID, templateId: 700001, type: 'birthday',
    code: 'FAKE-BDAY-PRIVATE', name: '가상 생일 쿠폰', discountPercent: 15,
    status: 'active', usedAt: null, issuedAt: NOW, expiresAt: new Date('2027-01-20T00:00:00Z'),
    birthdayYear: 2027, grantKey: occasionGrantKey('birthday', 2027), ...overrides,
  };
}

function fakeNotification(overrides: Row = {}): Row {
  return {
    id: 600001, memberId: MEMBER_ID, couponId: 800001, type: 'birthday', occasionYear: 2027,
    occasionDate: new Date('2027-01-15T00:00:00Z'), scheduledDate: new Date('2026-12-16T00:00:00Z'),
    channel: 'email', destinationHash: hash('fixture.member@example.invalid'),
    status: 'pending', attemptAt: null, ...overrides,
  };
}

let fixture: ReturnType<typeof memoryDb>;
function enable(channelMode = 'email') {
  Object.assign(fixture.tables.occasionAutomationSettings[0], { enabled: true, channelMode });
}
function seedDispatch(overrides: Row = {}) {
  enable();
  fixture.tables.coupons.push(fakeCoupon());
  fixture.tables.occasionNotifications.push(fakeNotification(overrides));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('JWT_SECRET', SECRET);
  fixture = memoryDb({
    members: [fakeMember()], coupons: [], consentLogs: [], occasionNotifications: [],
    couponTemplates: [
      { id: 700001, type: 'birthday', name: '가상 생일 쿠폰', discountPercent: 15, isActive: true },
      { id: 700002, type: 'anniversary', name: '가상 기념일 쿠폰', discountPercent: 15, isActive: true },
    ],
    occasionAutomationSettings: [{
      key: OCCASION_SETTINGS_KEY, enabled: false, channelMode: 'email_sms',
      startDate: new Date('2026-11-16T00:00:00Z'),
    }],
  });
  mocks.getDb.mockResolvedValue(fixture.db);
  mocks.preflight.mockResolvedValue({ allowed: true });
  mocks.send.mockResolvedValue({ status: 'accepted', providerMessageId: 'fake-provider-id' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('legacy occasion annual identity (real exported pure helpers)', () => {
  it('uses an explicit occasion year even when issued in the previous December', () => {
    expect(legacyOccasionYear({ birthdayYear: 2027, issuedAt: NOW })).toBe(2027);
  });
  it('uses KST rather than UTC for a null legacy year at the new-year boundary', () => {
    expect(legacyOccasionYear({ birthdayYear: null, issuedAt: new Date('2026-12-31T15:00:00Z') })).toBe(2027);
  });
  it('keeps the previous KST year immediately before midnight', () => {
    expect(legacyOccasionYear({ birthdayYear: null, issuedAt: new Date('2026-12-31T14:59:59Z') })).toBe(2026);
  });
  it('accepts a serialized legacy issuedAt timestamp', () => {
    expect(legacyOccasionYear({ birthdayYear: null, issuedAt: '2026-12-31T15:00:00Z' })).toBe(2027);
  });
  it('does not overwrite a non-null historic year with the issuedAt year', () => {
    expect(legacyOccasionYear({ birthdayYear: 2025, issuedAt: NOW })).toBe(2025);
  });
  it('recognizes a canonical next-year grant key issued in December', () => {
    expect(sameOccasionYear({ type: 'birthday', birthdayYear: null, issuedAt: NOW,
      grantKey: occasionGrantKey('birthday', 2027) }, 'birthday', 2027)).toBe(true);
  });
  it('recognizes a legacy coupon with no grant key using its explicit year', () => {
    expect(sameOccasionYear({ type: 'birthday', birthdayYear: 2027, issuedAt: NOW,
      grantKey: null }, 'birthday', 2027)).toBe(true);
  });
  it('recognizes the null-year KST fallback for a legacy annual grant', () => {
    expect(sameOccasionYear({ type: 'anniversary', birthdayYear: null,
      issuedAt: '2026-12-31T15:00:00Z', grantKey: null }, 'anniversary', 2027)).toBe(true);
  });
  it('keeps birthday and anniversary identities separate', () => {
    expect(sameOccasionYear({ type: 'anniversary', birthdayYear: 2027, issuedAt: NOW,
      grantKey: occasionGrantKey('birthday', 2027) }, 'birthday', 2027)).toBe(false);
  });
  it('does not count a previous-year legacy grant as the next annual grant', () => {
    expect(sameOccasionYear({ type: 'birthday', birthdayYear: 2026, issuedAt: NOW,
      grantKey: null }, 'birthday', 2027)).toBe(false);
  });
});

describe('queueMemberOccasions with a memory Drizzle contract', () => {
  it('does not issue, enqueue, lock, or send while current settings remain disabled', async () => {
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 0, queued: 0 });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    expect(fixture.db.insert).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('treats absent settings as unpublished/disabled', async () => {
    fixture.tables.occasionAutomationSettings.length = 0;
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 0, queued: 0 });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(fixture.db.insert).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not issue one day outside the exact KST D-30 window', async () => {
    enable('email_sms');
    expect(await queueMemberOccasions(MEMBER_ID, new Date('2026-12-15T01:00:00Z')))
      .toEqual({ issued: 0, queued: 0 });
    expect(fixture.tables.coupons).toHaveLength(0);
    expect(fixture.tables.occasionNotifications).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ['used', { status: 'used', usedAt: new Date('2026-12-01T00:00:00Z') }],
    ['expired status', { status: 'expired' }],
    ['expired active row', { status: 'active', expiresAt: new Date('2026-12-15T00:00:00Z') }],
    ['active but already used', { status: 'active', usedAt: new Date('2026-12-01T00:00:00Z') }],
  ])('does not reissue or falsely announce availability for a same-year legacy %s coupon', async (_label, overrides) => {
    enable('email_sms');
    fixture.tables.coupons.push(fakeCoupon({ grantKey: null, birthdayYear: 2027, ...overrides }));
    expect(await queueMemberOccasions(MEMBER_ID, NOW, 'birthday')).toEqual({ issued: 0, queued: 0 });
    expect(fixture.tables.coupons).toHaveLength(1);
    expect(fixture.tables.occasionNotifications).toHaveLength(0);
    expect(fixture.db.insert).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('records the explicit next occasion year across December, with a row lock before insertion', async () => {
    enable();
    expect(await queueMemberOccasions(MEMBER_ID, NOW, 'birthday')).toEqual({ issued: 1, queued: 1 });
    expect(fixture.tables.coupons[0]).toMatchObject({
      birthdayYear: 2027, grantKey: occasionGrantKey('birthday', 2027), issuedAt: NOW,
    });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({ occasionYear: 2027, channel: 'email' });
    expect(dayKey(fixture.tables.occasionNotifications[0].occasionDate)).toBe('2027-01-15');
    expect(dayKey(fixture.tables.occasionNotifications[0].scheduledDate)).toBe('2026-12-16');
    const lock = fixture.events.findIndex(event => event.kind === 'lock');
    const insert = fixture.events.findIndex(event => event.kind === 'insert');
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(fixture.events[lock].text).toContain('FOR UPDATE');
    expect(lock).toBeLessThan(insert);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('issues one coupon per type and one notification per annual type/channel, even on repeated queues', async () => {
    enable('email_sms');
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 2, queued: 4 });
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 0, queued: 0 });
    expect(fixture.tables.coupons).toHaveLength(2);
    expect(new Set(fixture.tables.coupons.map(row => row.grantKey)).size).toBe(2);
    expect(new Set(fixture.tables.occasionNotifications.map(row =>
      `${row.memberId}:${row.type}:${row.occasionYear}:${row.channel}`)).size).toBe(4);
    expect(fixture.tables.occasionNotifications.map(row => `${row.type}:${row.channel}`).sort()).toEqual([
      'anniversary:email', 'anniversary:sms', 'birthday:email', 'birthday:sms',
    ]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ['birthday', false],
    ['birthday', true],
    ['anniversary', false],
    ['anniversary', true],
  ] as const)('renews a used previous-year %s coupon at the next occasion D-30 (legacy=%s)', async (type, legacy) => {
    enable('email_sms');
    const previous = fakeCoupon({
      type, birthdayYear: 2026,
      grantKey: legacy ? null : occasionGrantKey(type, 2026),
      issuedAt: new Date('2026-01-01T01:00:00Z'),
      status: 'used', usedAt: new Date('2026-01-15T01:00:00Z'),
    });
    fixture.tables.coupons.push(previous);
    for (const channel of ['email', 'sms']) fixture.tables.occasionNotifications.push(fakeNotification({
      id: channel === 'email' ? 600001 : 600002,
      type, channel, occasionYear: 2026,
      occasionDate: new Date('2026-01-15T00:00:00Z'),
      scheduledDate: new Date('2025-12-16T00:00:00Z'),
      status: 'delivered', attemptAt: new Date('2026-01-01T01:00:00Z'),
    }));
    expect(await queueMemberOccasions(MEMBER_ID, NOW, type)).toEqual({ issued: 1, queued: 2 });
    const renewed = fixture.tables.coupons.find(row => row.id !== previous.id)!;
    expect(renewed).toMatchObject({
      type, birthdayYear: 2027, grantKey: occasionGrantKey(type, 2027),
      status: 'active', issuedAt: NOW,
    });
    expect(renewed.code).not.toBe(previous.code);
    const notices = fixture.tables.occasionNotifications.filter(row => row.occasionYear === 2027);
    expect(notices).toHaveLength(2);
    expect(notices.map(row => row.channel).sort()).toEqual(['email', 'sms']);
    for (const row of notices) {
      expect(row.couponId).toBe(renewed.id);
      expect(dayKey(row.occasionDate)).toBe('2027-01-15');
      expect(dayKey(row.scheduledDate)).toBe('2026-12-16');
    }
    expect(await queueMemberOccasions(MEMBER_ID, NOW, type)).toEqual({ issued: 0, queued: 0 });
    expect(previous).toMatchObject({ status: 'used', birthdayYear: 2026 });
    expect(fixture.tables.coupons).toHaveLength(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('renews both occasion types independently for a returning customer without resetting used coupons', async () => {
    enable('email_sms');
    const previous = ['birthday', 'anniversary'].map((type, index) => fakeCoupon({
      id: 800001 + index, type, birthdayYear: 2026,
      grantKey: occasionGrantKey(type as 'birthday' | 'anniversary', 2026),
      issuedAt: new Date('2026-01-01T01:00:00Z'),
      status: 'used', usedAt: new Date('2026-01-15T01:00:00Z'),
    }));
    fixture.tables.coupons.push(...previous);
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 2, queued: 4 });
    expect(await queueMemberOccasions(MEMBER_ID, NOW)).toEqual({ issued: 0, queued: 0 });
    expect(fixture.tables.coupons.filter(row => row.status === 'used')).toHaveLength(2);
    expect(fixture.tables.coupons.filter(row => row.birthdayYear === 2027 && row.status === 'active')).toHaveLength(2);
    expect(fixture.tables.occasionNotifications).toHaveLength(4);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses the next occasion year, not the coupon use year, and sends only the new coupon once per channel', async () => {
    enable('email_sms');
    const nextReminder = new Date('2027-12-16T01:00:00Z');
    const previous = fakeCoupon({ birthdayYear: 2027, grantKey: occasionGrantKey('birthday', 2027),
      status: 'used', issuedAt: NOW, usedAt: new Date('2026-12-22T01:00:00Z') });
    fixture.tables.coupons.push(previous);
    expect(await queueMemberOccasions(MEMBER_ID, nextReminder, 'birthday')).toEqual({ issued: 1, queued: 2 });
    const renewed = fixture.tables.coupons.find(row => row.birthdayYear === 2028)!;
    expect(renewed.grantKey).toBe(occasionGrantKey('birthday', 2028));
    expect(await dispatchOccasionNotifications(nextReminder)).toEqual({ ...EMPTY_SUMMARY, accepted: 2 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const call of mocks.send.mock.calls) {
      expect(call[2]).toMatchObject({ type: 'birthday', couponCode: renewed.code, occasionDate: '2028-01-15' });
      expect(call[2].couponCode).not.toBe(previous.code);
    }
    expect(await queueMemberOccasions(MEMBER_ID, nextReminder, 'birthday')).toEqual({ issued: 0, queued: 0 });
    expect(await dispatchOccasionNotifications(nextReminder)).toEqual(EMPTY_SUMMARY);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('reuses a usable legacy coupon without minting a second annual coupon', async () => {
    enable('email_sms');
    fixture.tables.coupons.push(fakeCoupon({ grantKey: null }));
    expect(await queueMemberOccasions(MEMBER_ID, NOW, 'birthday')).toEqual({ issued: 0, queued: 2 });
    expect(fixture.tables.coupons).toHaveLength(1);
    expect(fixture.tables.occasionNotifications.every(row => row.couponId === 800001)).toBe(true);
  });
});

describe('dispatchOccasionNotifications with provider calls fully mocked', () => {
  it('uses the latest withdrawal log to cancel despite stale member consent, including log-id ordering', async () => {
    seedDispatch();
    const timestamp = new Date('2026-12-15T00:00:00Z');
    fixture.tables.consentLogs.push(
      { id: 1, memberId: MEMBER_ID, consentType: 'marketing', agreed: true, consentContent: 'FAKE CONSENT', createdAt: timestamp },
      { id: 2, memberId: MEMBER_ID, consentType: 'marketing_withdraw', agreed: false, consentContent: 'FAKE WITHDRAWAL', createdAt: timestamp },
    );
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, cancelled: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({ status: 'cancelled', reason: 'consent_or_member_changed', attemptAt: null });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await queueMemberOccasions(MEMBER_ID, NOW, 'birthday')).toEqual({ issued: 0, queued: 0 });
  });

  it('cancels a queued notice when the customer changes the occasion date', async () => {
    seedDispatch();
    fixture.tables.members[0].birthDate = '1990-01-16';
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, cancelled: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({
      status: 'cancelled', reason: 'occasion_date_changed_or_missed', attemptAt: null,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(['sending', 'accepted', 'unknown'])('never retries a notification already in %s', async status => {
    seedDispatch({ status, attemptAt: new Date('2026-12-16T00:59:00Z') });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(fixture.tables.occasionNotifications[0].status).toBe(status);
    expect(fixture.db.update).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not retry a pending row that already has a durable attempt timestamp', async () => {
    seedDispatch({ attemptAt: new Date('2026-12-16T00:59:00Z') });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(fixture.db.update).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('commits sending/attemptAt before calling the sender and uses a stable idempotency key', async () => {
    seedDispatch();
    mocks.send.mockImplementation(async (...args: unknown[]) => {
      const row = fixture.tables.occasionNotifications[0];
      expect(row).toMatchObject({ status: 'sending', attemptAt: NOW });
      expect(fixture.events.at(-1)?.kind).toBe('commit');
      const lockIndex = fixture.events.findIndex(event => event.kind === 'lock');
      const attemptIndex = fixture.events.findIndex(event => event.kind === 'update' && event.data?.status === 'sending');
      expect(lockIndex).toBeGreaterThanOrEqual(0);
      expect(lockIndex).toBeLessThan(attemptIndex);
      expect(fixture.events[lockIndex].text).toContain('FOR UPDATE');
      expect(args).toEqual(['email', 'fixture.member@example.invalid', expect.objectContaining({
        type: 'birthday', couponCode: 'FAKE-BDAY-PRIVATE', occasionDate: '2027-01-15',
      }), 'nops-occasion-600001']);
      return { status: 'accepted', providerMessageId: 'fake-accepted-id' };
    });
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, accepted: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({ status: 'accepted', attemptAt: NOW, providerMessageId: 'fake-accepted-id' });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.preflight).not.toHaveBeenCalled();
  });

  it('does not retry after an ambiguous provider exception', async () => {
    seedDispatch();
    mocks.send.mockRejectedValue(new Error('FAKE PROVIDER RESPONSE UNKNOWN'));
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, unknown: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({
      status: 'unknown', reason: 'provider_response_unknown', attemptAt: NOW,
    });
    expect(await dispatchOccasionNotifications(NOW)).toEqual(EMPTY_SUMMARY);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('allows SMS only through an explicitly allowed preflight result', async () => {
    seedDispatch({ channel: 'sms', destinationHash: hash('01000000000') });
    enable('email_sms');
    mocks.preflight.mockResolvedValue({ allowed: true });
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, accepted: 1 });
    expect(mocks.preflight).toHaveBeenCalledWith('01000000000');
    expect(mocks.send).toHaveBeenCalledWith('sms', '01000000000', expect.any(Object), 'nops-occasion-600001');
  });

  it('fails closed when SMS preflight cannot establish permission', async () => {
    seedDispatch({ channel: 'sms', destinationHash: hash('01000000000') });
    enable('email_sms');
    mocks.preflight.mockResolvedValue({ allowed: false, reason: 'provider_permission_unknown' });
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, blocked: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({
      status: 'blocked', reason: 'provider_permission_unknown', attemptAt: null,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('blocks duplicate normalized phone numbers even when provider preflight permits SMS', async () => {
    seedDispatch({ channel: 'sms', destinationHash: hash('01000000000') });
    enable('email_sms');
    fixture.tables.members.push(fakeMember({ id: MEMBER_ID + 1, phone: '010-0000-0000', email: 'fixture.duplicate@example.invalid' }));
    expect(await dispatchOccasionNotifications(NOW)).toEqual({ ...EMPTY_SUMMARY, blocked: 1 });
    expect(fixture.tables.occasionNotifications[0]).toMatchObject({ status: 'blocked', reason: 'duplicate_phone', attemptAt: null });
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
