import mongoose from "mongoose";
import Account from "../seller/sellerPayoutAccount.model.js";
import { SellerFinanceLock } from "../seller/sellerEarning.model.js";
import { bankInput, decryptBankValue, encryptBankValue } from "./payout.security.js";
import { RazorpayXProvider } from "./providers/razorpayX.provider.js";
import type { BankValidation } from "./payout.provider.js";
import { NotificationService } from "../../notifications/notification.service.js";
import { NotificationType, NotificationRecipientRole } from "../../notifications/notification.model.js";

export const payoutProvider = new RazorpayXProvider();
export const publicAccountFields = "seller accountHolderName accountNumberLast4 ifsc bankName accountType verificationStatus verificationMessage verifiedAt isActive payoutHeld createdAt updatedAt";
export class PayoutAccountService {
    static get(seller: string) { return Account.findOne({ seller }).select(publicAccountFields); }
    static async save(seller: string, input: unknown) {
        const parsed = bankInput.safeParse(input);
        if (!parsed.success) throw new Error("Check bank details, IFSC and matching account numbers");
        const data = parsed.data;
        const encryptedAccountNumber = encryptBankValue(data.accountNumber);
        const encryptedUpiId = data.upiId ? encryptBankValue(data.upiId) : undefined;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await SellerFinanceLock.updateOne({ _id: seller }, { $inc: { revision: 1 } }, { upsert: true, session });
                const existing = await Account.findOne({ seller }).session(session);
                const revision = (existing?.revision || 0) + 1;
                await Account.findOneAndUpdate({ seller }, { $set: {
                    accountHolderName: data.accountHolderName, encryptedAccountNumber, encryptedUpiId: encryptedUpiId || "",
                    accountNumberLast4: data.accountNumber.slice(-4), ifsc: data.ifsc, bankName: data.bankName,
                    accountType: data.accountType, revision, verificationStatus: "UNVERIFIED", verificationMessage: "Verification pending",
                }, $unset: { providerContactId: 1, providerFundAccountId: 1, verificationReferenceId: 1, verifiedAt: 1, verificationLockUntil: 1 } },
                { new: true, upsert: true, session, runValidators: true });
                await NotificationService.enqueue({ userId: seller, recipientRole: NotificationRecipientRole.SELLER,
                    type: NotificationType.GENERAL, title: "Bank details updated", message: "Your payout account details changed and require verification.",
                    dedupeKey: `bank-updated:${seller}:${revision}` }, session);
            });
        } finally { await session.endSession(); }
        return this.get(seller);
    }
    static async applyValidation(validation: BankValidation) {
        const account = await Account.findOne({ verificationReferenceId: validation.id, providerFundAccountId: validation.fund_account.id });
        if (!account || account.verificationStatus === "VERIFIED") return;
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const valid = validation.status === "completed" && validation.results?.account_status === "active"
            && normalize(validation.results.registered_name || "") === normalize(account.accountHolderName);
        const status = valid ? "VERIFIED" : ["completed", "failed"].includes(validation.status) ? "FAILED" : "PENDING";
        const updated = await Account.findOneAndUpdate({ _id: account._id, revision: account.revision, verificationStatus: { $ne: "VERIFIED" } },
            { $set: { verificationStatus: status, verificationMessage: valid ? "Bank account verified" : status === "FAILED" ? "Bank details or holder name could not be verified. Please update your details or contact support." : "Verification pending",
                ...(valid ? { verifiedAt: new Date() } : {}) } }, { new: true });
        if (updated && status !== "PENDING") await NotificationService.create({ userId: updated.seller, recipientRole: NotificationRecipientRole.SELLER,
            type: NotificationType.GENERAL, title: valid ? "Bank account verified" : "Bank verification failed", message: updated.verificationMessage!,
            dedupeKey: `bank-validation:${updated._id}:${updated.revision}:${status}` });
    }
    static async verify(seller: string) {
        if (!payoutProvider.configured() || payoutProvider.mode() === "test" || process.env.ENABLE_SELLER_BANK_VERIFICATION !== "true") return this.get(seller);
        const account = await Account.findOneAndUpdate({ seller, isActive: true, verificationStatus: { $ne: "VERIFIED" },
            $or: [{ verificationLockUntil: null }, { verificationLockUntil: { $lte: new Date() } }] },
        { $set: { verificationLockUntil: new Date(Date.now() + 120_000) } }, { new: true }).select("+encryptedAccountNumber");
        if (!account) return this.get(seller);
        try {
            if (account.verificationReferenceId) {
                await this.applyValidation(await payoutProvider.fetchBankValidation(account.verificationReferenceId));
            } else {
                if (account.verificationStatus === "PENDING") throw new Error("Verification request is being reconciled; contact support");
                const beneficiary = await payoutProvider.createBeneficiary({ name: account.accountHolderName,
                    accountNumber: decryptBankValue(account.encryptedAccountNumber), ifsc: account.ifsc, reference: `${account._id}-${account.revision}` });
                const claimed = await Account.updateOne({ _id: account._id, revision: account.revision }, { $set: {
                    providerContactId: beneficiary.contactId, providerFundAccountId: beneficiary.fundAccountId, verificationStatus: "PENDING" } });
                if (!claimed.matchedCount) return this.get(seller);
                // Ambiguous validation errors remain PENDING; do not issue repeated penny drops.
                const validation = await payoutProvider.verifyBankAccount(beneficiary.fundAccountId);
                await Account.updateOne({ _id: account._id, revision: account.revision }, { $set: { verificationReferenceId: validation.id } });
                await this.applyValidation(validation);
            }
        } finally { await Account.updateOne({ _id: account._id, revision: account.revision }, { $unset: { verificationLockUntil: 1 } }); }
        return this.get(seller);
    }
}
