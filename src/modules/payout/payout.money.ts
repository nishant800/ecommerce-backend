export function paise(value: number): number {
    const result = Math.round(value * 100);
    if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid monetary amount");
    return result;
}

// GST is extracted from the inclusive selling value, never added to the payable total.
export function inclusiveGst(sellingRupees: number, rate: number | null | undefined, supplyState?: string, shippingState?: string) {
    if (rate == null) return { gstRate: null, gstAmount: null };
    if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) throw new Error("Invalid GST rate");
    const bps = BigInt(Math.round(rate * 100));
    const divisor = 10000n + bps;
    const gstPaise = Number((BigInt(paise(sellingRupees)) * bps + divisor / 2n) / divisor);
    const result: { gstRate: number | null; gstAmount: number | null; cgstAmount?: number; sgstAmount?: number; igstAmount?: number } = { gstRate: rate, gstAmount: gstPaise / 100 };
    // Only full, recognised state names determine splits. Unknown names/codes and missing locations stay unsplit.
    const states = new Set("andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|punjab|rajasthan|sikkim|tamil nadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal".split("|"));
    const normalize = (value?: string) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const source = normalize(supplyState), destination = normalize(shippingState);
    if (states.has(source) && states.has(destination)) {
        if (source === destination) {
            const central = Math.floor(gstPaise / 2);
            Object.assign(result, { cgstAmount: central / 100, sgstAmount: (gstPaise - central) / 100, igstAmount: 0 });
        } else Object.assign(result, { cgstAmount: 0, sgstAmount: 0, igstAmount: gstPaise / 100 });
    }
    return result;
}
export function commission(amount: number, basisPoints: number) {
    if (!Number.isSafeInteger(amount) || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("Invalid commission");
    return Number((BigInt(amount) * BigInt(basisPoints) + 5000n) / 10000n);
}
export function allocate(amount: number, weights: number[]) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return weights.map(() => 0);
    const capped = Math.min(amount, total);
    const shares = weights.map(w => Number(BigInt(capped) * BigInt(w) / BigInt(total)));
    let remainder = capped - shares.reduce((a, b) => a + b, 0);
    for (let i = 0; remainder > 0 && i < shares.length; i++) if (shares[i] < weights[i]) { shares[i]++; remainder--; }
    return shares;
}
export function isSingleSellerMode() {
    return process.env.SINGLE_SELLER_MODE === "true";
}
export function financeConfig() {
    const percent = isSingleSellerMode() ? "0" : process.env.MARKETPLACE_COMMISSION_PERCENT;
    if (!percent && process.env.NODE_ENV === "production") throw new Error("Marketplace commission must be configured");
    const bps = Math.round(Number(percent || 0) * 100);
    const holdDays = Number(process.env.SELLER_SETTLEMENT_HOLD_DAYS || 7);
    const minimum = Number(process.env.SELLER_PAYOUT_MINIMUM_PAISE || 10000);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000 || !Number.isFinite(holdDays) || holdDays < 0 || !Number.isSafeInteger(minimum) || minimum < 100) throw new Error("Invalid settlement configuration");
    return { bps, holdMs: holdDays * 86400000, minimum };
}
