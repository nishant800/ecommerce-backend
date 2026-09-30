import crypto from "node:crypto";
import { z } from "zod";

function key() {
    const raw = process.env.SELLER_BANK_ENCRYPTION_KEY || "";
    if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("Bank account storage is not configured");
    return Buffer.from(raw, "hex");
}
export function encryptBankValue(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}
export function decryptBankValue(value: string) {
    const [version, iv, tag, encrypted] = value.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted bank record");
    const cipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
    cipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([cipher.update(Buffer.from(encrypted, "hex")), cipher.final()]).toString("utf8");
}
export const bankInput = z.object({
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().regex(/^\d{9,18}$/),
    confirmAccountNumber: z.string().regex(/^\d{9,18}$/),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    bankName: z.string().trim().min(2).max(100),
    accountType: z.enum(["SAVINGS", "CURRENT"]),
    upiId: z.string().trim().regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/).optional().or(z.literal("")),
}).strict().refine(v => v.accountNumber === v.confirmAccountNumber, { message: "Account numbers must match" });

export function verifyWebhookSignature(body: Buffer, signature: string, secret: string) {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(crypto.createHmac("sha256", secret).update(body).digest(), Buffer.from(signature, "hex"));
}
