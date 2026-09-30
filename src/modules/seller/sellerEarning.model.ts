import mongoose, { Schema } from "mongoose";
const money = { type: Number, required: true, validate: Number.isSafeInteger };
const schema = new Schema({
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderItemIndex: { type: Number, required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: String,
    variant: String,
    quantity: { type: Number, required: true },
    grossAmount: money,
    discountAllocation: money,
    refundAmount: money,
    platformCommission: money,
    taxWithheld: { ...money, default: 0 },
    netAmount: money,
    commissionBps: { type: Number, required: true },
    kind: { type: String, enum: ["SALE", "ADJUSTMENT"], default: "SALE", required: true },
    sourceEarning: { type: Schema.Types.ObjectId, ref: "SellerEarning" },
    adjustmentKey: String,
    accountedDeduction: { ...money, default: 0 },
    revision: { type: Number, default: 0 },
    status: { type: String, enum: ["PENDING", "AVAILABLE", "PAYOUT_PENDING", "PAID", "REVERSED", "MANUAL"], required: true },
    paymentMethod: { type: String, required: true },
    settlementMode: { type: String, enum: ["ONLINE", "COD_COLLECTED_BY_SELLER"], required: true },
    eligibleAt: Date,
    payoutId: { type: Schema.Types.ObjectId, ref: "SellerPayout", default: null },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ order: 1, orderItemIndex: 1, seller: 1 }, { unique: true, partialFilterExpression: { kind: "SALE" } });
schema.index({ adjustmentKey: 1 }, { unique: true, partialFilterExpression: { adjustmentKey: { $type: "string" } } });
schema.index({ seller: 1, status: 1, eligibleAt: 1 });
export default mongoose.model("SellerEarning", schema);

// Append-only monetary history; SellerEarning is the current balance projection.
const eventSchema = new Schema({
    earning: { type: Schema.Types.ObjectId, required: true }, revision: { type: Number, required: true },
    previousNet: money, nextNet: money, refundAmount: money, reason: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
eventSchema.index({ earning: 1, revision: 1 }, { unique: true });
export const SellerEarningEvent = mongoose.model("SellerEarningEvent", eventSchema);

// Every settlement transaction writes this document to serialize seller balance changes across instances.
const lockSchema = new Schema({ _id: { type: Schema.Types.ObjectId, required: true }, revision: { type: Number, default: 0 } });
export const SellerFinanceLock = mongoose.model("SellerFinanceLock", lockSchema);
