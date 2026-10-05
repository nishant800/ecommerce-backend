export const PICKUP_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type PickupSchedule = {
    timezone: string;
    weeklySchedule: Record<string, { enabled: boolean; open: string; close: string }>;
    specialClosures: { date: string; reason?: string }[];
    temporarilyClosed: boolean;
};
export function defaultPickupSchedule(): PickupSchedule {
    return { timezone: 'Asia/Kolkata', weeklySchedule: Object.fromEntries(PICKUP_DAYS.map(day => [day, { enabled: day !== 'sunday', open: '10:00', close: '20:00' }])), specialClosures: [], temporarilyClosed: false };
}
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function validatePickupSchedule(value: any): PickupSchedule {
    if (!value || value.timezone !== 'Asia/Kolkata' || typeof value.temporarilyClosed !== 'boolean' || !Array.isArray(value.specialClosures) || value.specialClosures.length > 100) throw new Error('Invalid pickup schedule; use Asia/Kolkata timezone');
    const weeklySchedule: PickupSchedule['weeklySchedule'] = {};
    for (const day of PICKUP_DAYS) {
        const row = value.weeklySchedule?.[day];
        if (!row || typeof row.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.open || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.close || '')) throw new Error(`Invalid ${day} hours; use HH:mm`);
        if (row.enabled && minutes(row.close) - minutes(row.open) < 120) throw new Error(`${day} must allow at least 2 hours; overnight hours are unsupported`);
        weeklySchedule[day] = { enabled: row.enabled, open: row.open, close: row.close };
    }
    const specialClosures = value.specialClosures.map((entry: any) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry?.date || '') || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw new Error('Invalid closure date; use YYYY-MM-DD');
        return { date: entry.date, reason: typeof entry.reason === 'string' ? entry.reason.trim().slice(0, 100) : '' };
    });
    if (new Set(specialClosures.map((entry: any) => entry.date)).size !== specialClosures.length) throw new Error('Duplicate closure date');
    return { timezone: 'Asia/Kolkata', weeklySchedule, specialClosures, temporarilyClosed: value.temporarilyClosed };
}
// India uses UTC+05:30 year round. All eligibility is computed on the server.
const OFFSET = 330 * 60_000;
export const pickupLocalDate = (now: Date) => new Date(now.getTime() + OFFSET).toISOString().slice(0, 10);
const atTime = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
export const pickupTimeLabel = (date: Date) => date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
export function getSellerPickupAvailability(seller: any, now = new Date()) {
    const settings: PickupSchedule = seller?.business?.pickupSchedule || defaultPickupSchedule();
    const date = pickupLocalDate(now);
    const local = new Date(now.getTime() + OFFSET);
    const row = settings.weeklySchedule[PICKUP_DAYS[local.getUTCDay()]];
    const closure = settings.specialClosures.find(entry => entry.date === date);
    const enabled = Boolean(seller?.business?.pickupEnabled);
    const open = atTime(date, row.open); const close = atTime(date, row.close);
    const remainingOpenMinutes = Math.max(0, (close.getTime() - now.getTime()) / 60_000);
    const isOpen = enabled && !settings.temporarilyClosed && !closure && row.enabled && now >= open && now < close;
    const available = isOpen && remainingOpenMinutes >= 120;
    let nextOpenAt: string | null = null;
    if (enabled && !settings.temporarilyClosed) {
        // At most 100 exceptional closures plus a full weekly cycle.
        for (let offset = 0; offset <= 370; offset++) {
            const candidate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset));
            const candidateDate = candidate.toISOString().slice(0, 10);
            const hours = settings.weeklySchedule[PICKUP_DAYS[candidate.getUTCDay()]];
            if (!hours.enabled || settings.specialClosures.some(entry => entry.date === candidateDate)) continue;
            const opening = atTime(candidateDate, hours.open);
            if (opening > now) { nextOpenAt = opening.toISOString(); break; }
        }
    }
    const reason = !enabled ? 'Pickup disabled by seller' : settings.temporarilyClosed ? 'Store temporarily closed'
        : closure ? `Special closure${closure.reason ? `: ${closure.reason}` : ''}` : !row.enabled ? 'Store closed today'
        : now < open ? `Store opens at ${pickupTimeLabel(open)}` : now >= close ? 'Store closed for today'
        : !available ? `Pickup reservations closed for today; store closes at ${pickupTimeLabel(close)}` : '';
    const status = closure ? 'Special Closure' : !isOpen ? 'Closed' : remainingOpenMinutes <= 60 ? 'Closing Soon' : 'Open now';
    const nextOpenLabel = nextOpenAt ? `Opens ${pickupLocalDate(new Date(nextOpenAt)) === date ? 'today' : pickupLocalDate(new Date(nextOpenAt)) === pickupLocalDate(new Date(now.getTime() + 86400_000)) ? 'tomorrow' : new Date(nextOpenAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' })} at ${pickupTimeLabel(new Date(nextOpenAt))}` : '';
    const statusLine = isOpen ? `${status} - Until ${pickupTimeLabel(close)}` : `${reason}${nextOpenLabel ? ` - ${nextOpenLabel}` : ''}`;
    return { available, isOpen: Boolean(isOpen), reason, status, statusLine,
        availabilityLine: available ? `Open until ${pickupTimeLabel(close)}` : isOpen
            ? `Pickup unavailable after ${pickupTimeLabel(new Date(close.getTime() - 120 * 60_000))}`
            : `${closure || !row.enabled ? 'Closed today' : reason}${nextOpenLabel ? ` - ${nextOpenLabel}` : ''}`,
        timezone: settings.timezone, currentOpenTime: row.enabled && !closure ? open.toISOString() : null,
        currentCloseTime: row.enabled && !closure ? close.toISOString() : null,
        hoursLabel: row.enabled && !closure ? `${pickupTimeLabel(open)} - ${pickupTimeLabel(close)}` : 'Closed today',
        remainingOpenMinutes, nextOpenAt, nextOpenLabel };
}
