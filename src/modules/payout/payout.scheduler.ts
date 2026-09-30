import Order from "../orders/order.model.js";
import Account from "../seller/sellerPayoutAccount.model.js";
import Earning, { SellerEarningEvent, SellerFinanceLock } from "../seller/sellerEarning.model.js";
import Payout from "./payout.model.js";
import Notification from "../../notifications/notification.model.js";
import { EarningService } from "./earning.service.js";
import { PayoutService } from "./payout.service.js";
import { PayoutAccountService } from "./payout-account.service.js";
import { releaseSellerNotifications } from "../payment/payment-lifecycle.js";
import { NotificationService } from "../../notifications/notification.service.js";
import { OrderService } from "../orders/order.service.js";
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;
let cursor: string | undefined;
let nextPayoutRun = Date.now() + 86_400_000;
export async function initializeFinanceIndexes() {
    // Additive only. Never sync/drop existing production indexes or backfill historical orders.
    await Promise.all([Account.createIndexes(), Earning.createIndexes(), SellerEarningEvent.createIndexes(),
        SellerFinanceLock.createIndexes(), Payout.createIndexes(),
        Notification.collection.createIndex({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }),
        Order.collection.createIndex({ paymentRetryEnabled: 1, paymentStatus: 1, orderStatus: 1, paymentRetryExpiresAt: 1, createdAt: 1 })]);
}
export function startSettlementScheduler() {
    if (timer) return;
    if (!process.env.MARKETPLACE_COMMISSION_PERCENT) console.warn("MARKETPLACE_COMMISSION_PERCENT missing: development uses zero; production settlements are blocked");
    const sweep = async () => {
        if (busy) return;
        busy = true;
        try {
            const orders = await Order.find({ settlementEnabled: true, ...(cursor ? { _id: { $gt: cursor } } : {}) }).sort({ _id: 1 }).limit(100).select("_id");
            for (const order of orders) {
                try { await OrderService.reconcileCancelledPaidOrder(String(order._id)); await EarningService.reconcileOrder(String(order._id)); await releaseSellerNotifications(String(order._id)); await OrderService.notifyCancellation(String(order._id)); }
                catch { console.error("Settlement reconciliation deferred", String(order._id)); }
            }
            cursor = orders.length === 100 ? String(orders.at(-1)!._id) : undefined;
            const accounts = await Account.find({ verificationStatus: "PENDING", verificationReferenceId: { $type: "string" } }).select("seller").limit(100);
            for (const account of accounts) {
                try { await PayoutAccountService.verify(String(account.seller)); } catch { /* Next sweep retries. */ }
            }
            await NotificationService.dispatchPending();
            if (Date.now() >= nextPayoutRun) {
                nextPayoutRun = Date.now() + 86_400_000;
                await PayoutService.processEligibleSellerPayouts();
            }
        } finally { busy = false; }
    };
    timer = setInterval(() => void sweep().catch(() => console.error("Settlement sweep deferred")), 60_000);
    timer.unref();
    void sweep().catch(() => console.error("Settlement sweep deferred"));
}
