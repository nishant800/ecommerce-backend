import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPickupSchedule, getSellerPickupAvailability, validatePickupSchedule } from '../src/modules/orders/pickup-schedule.js';
const seller = () => ({ business: { pickupEnabled: true, pickupSchedule: defaultPickupSchedule() } });
const at = (time: string, date = '2026-10-05') => new Date(`${date}T${time}:00+05:30`);
test('Monday 10 AM-8 PM allows 5 PM and exactly 6 PM, rejects 6:01 PM without shortening expiry', () => {
    const s = seller(); validatePickupSchedule(s.business.pickupSchedule);
    assert.equal(getSellerPickupAvailability(s, at('17:00')).available, true);
    assert.equal(getSellerPickupAvailability(s, at('18:00')).available, true);
    const cutoff = getSellerPickupAvailability(s, at('18:01'));
    assert.equal(cutoff.available, false); assert.equal(cutoff.isOpen, true); assert.equal(cutoff.remainingOpenMinutes, 119);
    assert.match(cutoff.reason, /closes/);
    assert.equal(cutoff.nextOpenAt, at('10:00', '2026-10-06').toISOString());
});
test('weekly closures, holidays and manual closures return useful status and next opening', () => {
    const s = seller();
    const sunday = getSellerPickupAvailability(s, at('12:00', '2026-10-11')); assert.equal(sunday.available, false); assert.equal(sunday.nextOpenAt, at('10:00', '2026-10-12').toISOString());
    s.business.pickupSchedule.specialClosures = [{ date: '2026-10-12', reason: 'Holiday' }];
    assert.equal(getSellerPickupAvailability(s, at('12:00', '2026-10-11')).nextOpenAt, at('10:00', '2026-10-13').toISOString());
    assert.match(getSellerPickupAvailability(s, at('12:00', '2026-10-12')).reason, /Holiday/);
    s.business.pickupSchedule.temporarilyClosed = true;
    const closed = getSellerPickupAvailability(s, at('17:00')); assert.equal(closed.available, false); assert.equal(closed.nextOpenAt, null);
    s.business.pickupEnabled = false; assert.match(getSellerPickupAvailability(s, at('17:00')).reason, /disabled/);
});
test('opening/closing boundaries and timezone use store time rather than caller timezone', () => {
    const s = seller();
    assert.equal(getSellerPickupAvailability(s, at('09:59')).isOpen, false);
    assert.equal(getSellerPickupAvailability(s, at('09:59')).nextOpenAt, at('10:00').toISOString());
    assert.equal(getSellerPickupAvailability(s, at('10:00')).available, true);
    assert.equal(getSellerPickupAvailability(s, at('20:00')).isOpen, false);
    assert.equal(getSellerPickupAvailability(s, new Date('2026-10-05T12:30:00Z')).available, true);
    assert.equal(getSellerPickupAvailability(s, at('19:25')).status, 'Closing Soon');
});
test('validate complete settings, invalid dates, insufficient/overnight hours and all-week closure', () => {
    const s = seller(); s.business.pickupSchedule.weeklySchedule.monday.close = '11:00'; assert.throws(() => validatePickupSchedule(s.business.pickupSchedule));
    s.business.pickupSchedule = defaultPickupSchedule(); s.business.pickupSchedule.specialClosures = [{ date: '2026-02-30' }]; assert.throws(() => validatePickupSchedule(s.business.pickupSchedule));
    s.business.pickupSchedule = defaultPickupSchedule(); Object.values(s.business.pickupSchedule.weeklySchedule).forEach(row => row.enabled = false);
    assert.equal(getSellerPickupAvailability(s, at('17:00')).nextOpenAt, null);
});
