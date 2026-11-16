import { describe, it, expect, vi } from 'vitest';
vi.mock('./db', () => ({ getDb: vi.fn() }));
vi.mock('./occasionNotification', () => ({ sendOccasionNotice: vi.fn(), readOccasionNoticeDelivery: vi.fn() }));
vi.mock('./occasionSmsPreflight', () => ({ occasionSmsPreflight: vi.fn() }));
import { pendingOccasionCandidates } from './occasionAutomation';

const now = new Date('2026-11-16T01:00:00Z');
const due = [1, 2, 3, 4].map(id => ({ id, occasionYear: 2026 }));
const notice = (memberId: number, channel: string) => ({ memberId, type: 'birthday', occasionYear: 2026, channel });
const coupon = (memberId: number, overrides = {}) => ({ memberId, type: 'birthday', birthdayYear: 2026, issuedAt: now, grantKey: 'occasion:birthday:2026', status: 'active', usedAt: null, expiresAt: new Date('2027-11-16T01:00:00Z'), ...overrides });

describe('D-30 queue progress across time-limited callbacks', () => {
  it('moves to the next members after a bounded first callback', () => {
    const first = pendingOccasionCandidates(due, 'birthday', 'email_sms', [], [], now).slice(0, 2);
    const completed = first.flatMap(m => [notice(m.id, 'email'), notice(m.id, 'sms')]);
    expect(pendingOccasionCandidates(due, 'birthday', 'email_sms', completed, first.map(m => coupon(m.id)), now).map(m => m.id)).toEqual([3, 4]);
  });
  it('does not recreate already queued notices regardless of later outcome', () => {
    const existing = due.flatMap(m => [notice(m.id, 'email'), notice(m.id, 'sms')]);
    expect(pendingOccasionCandidates(due, 'birthday', 'email_sms', existing, [], now)).toEqual([]);
  });
  it('retains the member when one selected channel has not been queued', () => {
    expect(pendingOccasionCandidates([due[0]], 'birthday', 'email_sms', [notice(1, 'email')], [coupon(1)], now)).toEqual([due[0]]);
  });
  it('skips used, inactive or expired same-year coupons without replacement', () => {
    const history = [coupon(1, { status: 'used', usedAt: now }), coupon(2, { status: 'expired' }), coupon(3, { expiresAt: now })];
    expect(pendingOccasionCandidates(due, 'birthday', 'email_sms', [], history, now).map(m => m.id)).toEqual([4]);
  });
  it('does not treat another year or occasion as processed', () => {
    const history = [coupon(1, { birthdayYear: 2025, grantKey: 'occasion:birthday:2025', issuedAt: new Date('2025-11-16T01:00:00Z'), status: 'used' }), coupon(2, { type: 'anniversary', status: 'used' })];
    expect(pendingOccasionCandidates(due, 'birthday', 'email_sms', [notice(3, 'email')], history, now)).toEqual(due);
  });
  it('honours single-channel mode and disabled channels', () => {
    expect(pendingOccasionCandidates([due[0]], 'birthday', 'email', [notice(1, 'email')], [], now)).toEqual([]);
    expect(pendingOccasionCandidates(due, 'birthday', 'none', [], [], now)).toEqual([]);
  });
});
