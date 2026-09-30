import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    payoutAccount: { type: Schema.Types.ObjectId, ref: "SellerPayoutAccount", required: true },
    accountSnapshot: {
        revision: Number, accountHolderName: String, bankName: String, accountNumberLast4: String,
        ifsc: String, providerFundAccountId: String,
    },
    amount: { type: Number, required: true, min: 100, validate: Number.isSafeInteger },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["QUEUED", "PROCESSING", "PROCESSED", "FAILED", "REVERSED"], default: "QUEUED" },
    provider: { type: String, default: "RAZORPAY_X" },
    providerPayoutId: String,
    providerReferenceId: { type: String, required: true, unique: true },
    providerMode: { type: String, enum: ["test", "live"], required: true },
    sourceAccount: { type: String, required: true, select: false },
    earningIds: [{ type: Schema.Types.ObjectId, ref: "SellerEarning" }],
    failureCode: String,
    failureReason: String,
    requestedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    processedAt: Date,
    failedAt: Date,
    webhookEventIds: { type: [String], default: [] },
    audit: [{ _id: false, status: String, at: Date, source: String }],
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ seller: 1, createdAt: -1 });
schema.index({ providerPayoutId: 1 }, { unique: true, partialFilterExpression: { providerPayoutId: { $type: "string" } } });
export default mongoose.model("SellerPayout", schema);
