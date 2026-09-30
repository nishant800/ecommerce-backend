import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    accountHolderName: { type: String, required: true },
    encryptedAccountNumber: { type: String, required: true, select: false },
    encryptedUpiId: { type: String, select: false },
    accountNumberLast4: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankName: { type: String, required: true },
    accountType: { type: String, enum: ["SAVINGS", "CURRENT"], required: true },
    verificationStatus: { type: String, enum: ["UNVERIFIED", "PENDING", "VERIFIED", "FAILED"], default: "UNVERIFIED" },
    provider: { type: String, default: "RAZORPAY_X" },
    providerContactId: String,
    providerFundAccountId: String,
    verificationReferenceId: String,
    verificationMessage: String,
    verifiedAt: Date,
    revision: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    payoutHeld: { type: Boolean, default: false },
    verificationLockUntil: Date,
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model("SellerPayoutAccount", schema);
