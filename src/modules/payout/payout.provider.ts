export interface ProviderPayout {
    id: string; status: string; amount: number; currency: string;
    fund_account_id: string; reference_id?: string | null; utr?: string | null;
}
export interface BankValidation {
    id: string; status: string; fund_account: { id: string };
    results?: { account_status?: string | null; registered_name?: string | null };
}
export interface PayoutRequest {
    amount: number; fundAccountId: string; reference: string; sourceAccount: string;
}
export interface PayoutProvider {
    configured(): boolean;
    mode(): "test" | "live";
    createBeneficiary(input: { name: string; accountNumber: string; ifsc: string; reference: string }): Promise<{ contactId: string; fundAccountId: string }>;
    verifyBankAccount(fundAccountId: string): Promise<BankValidation>;
    fetchBankValidation(id: string): Promise<BankValidation>;
    createPayout(input: PayoutRequest): Promise<ProviderPayout>;
    fetchPayout(id: string): Promise<ProviderPayout>;
}
