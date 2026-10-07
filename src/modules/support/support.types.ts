export type SupportRole = 'customer' | 'seller';
export type SupportTopic = 'order' | 'payment' | 'refund' | 'pickup' | 'none';
export const CATEGORIES = ['orders', 'delivery', 'pickup', 'payment', 'refunds', 'settlements', 'products', 'account', 'other'] as const;
export type SupportCategory = typeof CATEGORIES[number];
export interface SupportMessage { role: 'user' | 'assistant'; content: string; createdAt: Date }
export interface SafeSupportContext {
    role: SupportRole;
    order?: { reference: string; status: string; fulfillmentType: string; paymentStatus: string; paymentMethod: string; refundStatus: string; createdAt: string;
        pickupStatus?: string; pickupExpiresAt?: string; reservationElapsed?: boolean; refundRequired?: boolean; deliveryStatus?: string; itemRefundStatuses?: string[] };
    store?: { pickupEnabled: boolean; pickupSchedule: { timezone: string; weeklySchedule: Record<string, { enabled: boolean; open: string; close: string }>; specialClosureDates: string[]; temporarilyClosed: boolean }; pickupAvailable: boolean; pickupReason: string; hoursLabel: string };
}
export interface SupportAnswer { message: string; suggestedActions: ('contact_support' | 'view_order' | 'pickup_settings')[]; source: 'knowledge' | 'ai'; needsHuman: boolean }
export class SupportError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
