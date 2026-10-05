export type PickupSellerProfile = {
    phone?: unknown;
    business?: { pickupEnabled?: boolean; shopName?: unknown; shopPhone?: unknown; address?: unknown; area?: unknown; landmark?: unknown; city?: unknown; state?: unknown; pincode?: unknown; country?: unknown };
};

export function normalizeSellerPickupAddress(seller: PickupSellerProfile) {
    const b = seller.business;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    return {
        shopName: text(b?.shopName), phone: text(b?.shopPhone) || text(seller.phone),
        address: text(b?.address), area: text(b?.area), landmark: text(b?.landmark),
        city: text(b?.city), state: text(b?.state), pincode: text(b?.pincode),
        country: text(b?.country) || 'India',
    };
}

export function getMissingPickupAddressFields(seller: PickupSellerProfile) {
    const address = normalizeSellerPickupAddress(seller);
    const missing: string[] = [];
    for (const [key, label] of [
        ['shopName', 'Shop / Business Name'], ['address', 'Address'], ['city', 'City'],
        ['state', 'State'], ['pincode', 'Pincode'], ['country', 'Country'], ['phone', 'Contact Phone'],
    ] as const) {
        if (!address[key]) missing.push(label);
    }
    if (address.pincode && !/^\d{6}$/.test(address.pincode)) missing.push('Pincode (6 digits)');
    return missing;
}
