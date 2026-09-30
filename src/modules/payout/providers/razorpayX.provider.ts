import { z } from "zod";
import type { PayoutProvider, PayoutRequest } from "../payout.provider.js";

const payoutSchema = z.object({ id: z.string().startsWith("pout_"), status: z.string(), amount: z.number().int(),
    currency: z.string(), fund_account_id: z.string(), reference_id: z.string().nullable().optional(), utr: z.string().nullable().optional() });
const validationSchema = z.object({ id: z.string(), status: z.string(), fund_account: z.object({ id: z.string() }),
    results: z.object({ account_status: z.string().nullable().optional(), registered_name: z.string().nullable().optional() }).optional() });

export class RazorpayXProvider implements PayoutProvider {
    configured() { return Boolean(process.env.RAZORPAYX_KEY_ID && process.env.RAZORPAYX_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER); }
    mode(): "test" | "live" { return process.env.RAZORPAYX_MODE === "live" ? "live" : "test"; }
    private async request(path: string, body?: object, idempotency?: string): Promise<unknown> {
        if (!this.configured()) throw new Error("Payout provider is not configured");
        const id = process.env.RAZORPAYX_KEY_ID!;
        if (!id.startsWith(`rzp_${this.mode()}_`)) throw new Error("Payout provider mode and key do not match");
        const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
            method: body ? "POST" : "GET", signal: AbortSignal.timeout(25_000),
            headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${id}:${process.env.RAZORPAYX_KEY_SECRET}`).toString("base64")}`,
                ...(idempotency ? { "X-Payout-Idempotency": idempotency } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        // Provider error bodies can contain banking data. Never log or forward them.
        if (!response.ok) throw new Error(`Payout provider request failed (${response.status}); reconciliation required`);
        return response.json();
    }
    async createBeneficiary(input: { name: string; accountNumber: string; ifsc: string; reference: string }) {
        const contact = z.object({ id: z.string() }).parse(await this.request("contacts", { name: input.name, type: "vendor", reference_id: input.reference }));
        const fund = z.object({ id: z.string() }).parse(await this.request("fund_accounts", { contact_id: contact.id, account_type: "bank_account",
            bank_account: { name: input.name, ifsc: input.ifsc, account_number: input.accountNumber } }));
        return { contactId: contact.id, fundAccountId: fund.id };
    }
    async verifyBankAccount(fundAccountId: string) {
        if (this.mode() !== "live" || process.env.ENABLE_SELLER_BANK_VERIFICATION !== "true") throw new Error("Bank verification is not enabled");
        return validationSchema.parse(await this.request("fund_accounts/validations", { account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
            fund_account: { id: fundAccountId }, amount: 100, currency: "INR" }));
    }
    async fetchBankValidation(id: string) { return validationSchema.parse(await this.request(`fund_accounts/validations/${encodeURIComponent(id)}`)); }
    async createPayout(input: PayoutRequest) {
        return payoutSchema.parse(await this.request("payouts", { account_number: input.sourceAccount,
            fund_account_id: input.fundAccountId, amount: input.amount, currency: "INR", mode: "IMPS", purpose: "payout",
            queue_if_low_balance: true, reference_id: input.reference, narration: "Seller settlement" }, input.reference));
    }
    async fetchPayout(id: string) { return payoutSchema.parse(await this.request(`payouts/${encodeURIComponent(id)}`)); }
}
