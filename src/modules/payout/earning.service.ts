import mongoose, { type ClientSession } from "mongoose";
import Order from "../orders/order.model.js";
import Earning, { SellerEarningEvent, SellerFinanceLock } from "../seller/sellerEarning.model.js";
import { allocate, commission, financeConfig, paise } from "./payout.money.js";
import { NotificationService } from "../../notifications/notification.service.js";
import { NotificationType, NotificationRecipientRole } from "../../notifications/notification.model.js";

export class EarningService {
    static async lock(seller: string, session: ClientSession) {
        await SellerFinanceLock.updateOne({ _id: seller }, { $inc: { revision: 1 } }, { upsert: true, session });
    }
    static async reconcileOrder(orderId: string) {
        const snapshot = await Order.findById(orderId).select("items.seller settlementEnabled");
        if (!snapshot?.settlementEnabled) return;
        for (const seller of [...new Set(snapshot.items.map(i => String(i.seller)))].sort()) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await this.lock(seller, session);
                    await this.reconcileForSeller(orderId, seller, session);
                });
            } finally { await session.endSession(); }
        }
    }
    static async reconcileForSeller(orderId: string, seller: string, session: ClientSession) {
        // A write creates a conflict with cancellation/refund/status updates. A stale read alone is insufficient.
        const order = await Order.findOneAndUpdate({ _id: orderId, settlementEnabled: true },
            { $inc: { settlementRevision: 1, __v: 1 } }, { new: true, session });
        if (!order) return;
        const online = /^(online|razorpay)$/i.test(order.paymentMethod);
        if (online && (order.paymentStatus !== "success" || !order.sellerReleasedAt)) return;
        if (!online && order.orderStatus !== "delivered" && !order.items.some(i => i.fulfilmentStatus === "delivered")) return;
        const config = financeConfig();
        const totals = order.items.map(i => paise(i.price) * i.quantity);
        const cancellations = order.items.map((i, index) => Math.min(totals[index], paise(i.price) * (i.cancelledQuantity || 0)));
        // Any additional provider refund is allocated over remaining merchandise. Shipping is never seller revenue.
        const totalRefund = paise((order.refundedAmount || 0) + (order.pendingRefundAmount || 0));
        const extra = Math.max(0, totalRefund - cancellations.reduce((a, b) => a + b, 0));
        const extraAllocation = allocate(extra, totals.map((v, i) => v - cancellations[i]));
        for (let index = 0; index < order.items.length; index++) {
            const item = order.items[index];
            if (String(item.seller) !== seller) continue;
            if (!online && item.fulfilmentStatus !== "delivered" && order.orderStatus !== "delivered") continue;
            const gross = totals[index];
            const refund = cancellations[index] + extraAllocation[index];
            let earning = await Earning.findOne({ order: order._id, orderItemIndex: index, seller, kind: "SALE" }).session(session);
            const rate = earning?.commissionBps ?? config.bps;
            const fullNet = gross - commission(gross, rate);
            const targetNet = gross - refund - commission(gross - refund, rate);
            const deduction = fullNet - targetNet;
            const deliveryDate = item.deliveredAt || order.deliveredAt;
            const eligibleAt = deliveryDate ? new Date(deliveryDate.getTime() + config.holdMs) : undefined;
            const nextStatus = !online ? "MANUAL" : targetNet === 0 ? "REVERSED" : eligibleAt && eligibleAt <= new Date() ? "AVAILABLE" : "PENDING";
            if (!earning) {
                [earning] = await Earning.create([{
                    seller, order: order._id, orderItemIndex: index, product: item.product,
                    productName: item.name, variant: Object.values(item.variant || {}).filter(Boolean).join(" / "), quantity: item.quantity,
                    grossAmount: gross, discountAllocation: Math.max(0, paise(item.basePrice) * item.quantity - gross),
                    hsnCode: item.hsnCode, gstRate: item.gstRate, gstAmount: item.gstAmount == null ? null : paise(item.gstAmount),
                    refundAmount: refund, platformCommission: commission(gross - refund, rate), taxWithheld: 0,
                    netAmount: targetNet, commissionBps: rate, kind: "SALE", accountedDeduction: deduction,
                    status: nextStatus, eligibleAt, paymentMethod: order.paymentMethod,
                    settlementMode: online ? "ONLINE" : "COD_COLLECTED_BY_SELLER", revision: 1,
                }], { session });
                await SellerEarningEvent.create([{ earning: earning._id, revision: 1, previousNet: 0, nextNet: targetNet, refundAmount: refund, reason: "EARNING_CREATED" }], { session });
            } else if (earning.status === "PAID" || earning.status === "PAYOUT_PENDING") {
                const delta = deduction - earning.accountedDeduction;
                if (delta > 0) {
                    // Preserve the reserved/paid monetary snapshot; carry debt into future settlements.
                    const key = `${earning._id}:${deduction}`;
                    await Earning.create([{ seller, order: order._id, orderItemIndex: index, product: item.product,
                        productName: item.name, variant: earning.variant, quantity: 0, grossAmount: 0, discountAllocation: 0,
                        refundAmount: delta, platformCommission: 0, taxWithheld: 0, netAmount: -delta, commissionBps: rate,
                        kind: "ADJUSTMENT", sourceEarning: earning._id, adjustmentKey: key, accountedDeduction: 0,
                        status: "AVAILABLE", eligibleAt: new Date(), paymentMethod: order.paymentMethod, settlementMode: "ONLINE" }], { session });
                    earning.accountedDeduction = deduction;
                    earning.revision++;
                    await SellerEarningEvent.create([{ earning: earning._id, revision: earning.revision, previousNet: earning.netAmount,
                        nextNet: earning.netAmount, refundAmount: refund, reason: `REFUND_ADJUSTMENT:${delta}` }], { session });
                    await earning.save({ session });
                }
            } else {
                // Released failed payouts may already have separate deductions; don't deduct them again.
                const adjustments = await Earning.find({ sourceEarning: earning._id }).session(session);
                const separateDeduction = -adjustments.reduce((sum, row) => sum + row.netAmount, 0);
                const net = targetNet + separateDeduction;
                if (earning.netAmount !== net || earning.status !== nextStatus || earning.refundAmount !== refund) {
                    const previousNet = earning.netAmount;
                    earning.netAmount = net;
                    earning.refundAmount = refund;
                    earning.platformCommission = commission(gross - refund, rate);
                    earning.accountedDeduction = deduction;
                    earning.status = net > 0 && nextStatus === "REVERSED" ? "AVAILABLE" : nextStatus;
                    earning.eligibleAt = eligibleAt;
                    earning.revision++;
                    await earning.save({ session });
                    await SellerEarningEvent.create([{ earning: earning._id, revision: earning.revision, previousNet, nextNet: net, refundAmount: refund, reason: "ORDER_RECONCILED" }], { session });
                }
            }
            if (earning.status === "AVAILABLE") await NotificationService.enqueue({ userId: seller,
                recipientRole: NotificationRecipientRole.SELLER, type: NotificationType.GENERAL,
                title: "Settlement available", message: "An earning is now available for settlement. View Payments for your balance.",
                orderId: order._id, dedupeKey: `earning-available:${earning._id}` }, session);
        }
    }
    static async summary(seller: string) {
        const rows = await Earning.aggregate<{ _id: string; amount: number }>([
            { $match: { seller: new mongoose.Types.ObjectId(seller) } },
            { $group: { _id: "$status", amount: { $sum: "$netAmount" } } },
        ]);
        const sums = Object.fromEntries(rows.map(r => [r._id, r.amount]));
        const sales = await Earning.aggregate([{ $match: { seller: new mongoose.Types.ObjectId(seller), kind: "SALE" } },
            // Reserved/paid rows retain their monetary snapshot; the latest audit records current gross refunds.
            { $lookup: { from: SellerEarningEvent.collection.name, localField: "_id", foreignField: "earning",
                pipeline: [{ $sort: { revision: -1 } }, { $limit: 1 }], as: "latestEvent" } },
            { $group: { _id: null, grossSales: { $sum: "$grossAmount" },
                refunded: { $sum: { $ifNull: [{ $arrayElemAt: ["$latestEvent.refundAmount", 0] }, "$refundAmount"] } } } }]);
        const adjustments = await Earning.aggregate([{ $match: { seller: new mongoose.Types.ObjectId(seller), kind: "ADJUSTMENT" } },
            { $group: { _id: null, amount: { $sum: "$netAmount" } } }]);
        return { currency: "INR", unit: "paise", available: Math.max(0, sums.AVAILABLE || 0), balance: sums.AVAILABLE || 0,
            pendingSettlement: sums.PENDING || 0, payoutPending: sums.PAYOUT_PENDING || 0, paidOut: sums.PAID || 0,
            manualCod: sums.MANUAL || 0, adjustments: adjustments[0]?.amount || 0,
            grossSales: sales[0]?.grossSales || 0, refunded: sales[0]?.refunded || 0,
            netSales: (sales[0]?.grossSales || 0) - (sales[0]?.refunded || 0) };
    }
}
