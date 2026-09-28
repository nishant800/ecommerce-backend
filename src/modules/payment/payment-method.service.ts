import PaymentMethod, { PaymentMethodType } from "./payment-method.model.js";
export class PaymentMethodService {
    static async getMethods(userId: string) {
        return PaymentMethod.find({ user: userId })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean();
    }
    static async addMethod(
        userId: string,
        data: {
            type: PaymentMethodType;
            value: string;
            last4?: string;
        },
    ) {
        const type = data.type;
        const value = String(data.value || "").trim();
        if (type !== "upi" && type !== "card") {
            throw new Error("Invalid payment method type.");
        }
        if (!value) {
            throw new Error(
                type === "upi"
                    ? "UPI ID is required."
                    : "Card details are required.",
            );
        }
        if (type === "upi") {
            if (!/^[^\s@]+@[^\s@]+$/.test(value)) {
                throw new Error("Please enter a valid UPI ID.");
            }
            const normalized = value.toLowerCase();
            const exists = await PaymentMethod.findOne({
                user: userId,
                type: "upi",
                value: normalized,
            });
            if (exists) {
                throw new Error("This UPI ID is already saved.");
            }
            const hasMethods = await PaymentMethod.exists({
                user: userId,
            });
            return PaymentMethod.create({
                user: userId,
                type: "upi",
                label: "UPI",
                value: normalized,
                isDefault: !hasMethods,
            });
        }
        const last4 = String(data.last4 || "")
            .replace(/\D/g, "")
            .slice(-4);
        if (last4.length !== 4) {
            throw new Error("Invalid card details.");
        }
        const exists = await PaymentMethod.findOne({
            user: userId,
            type: "card",
            last4,
        });
        if (exists) {
            throw new Error("This card is already saved.");
        }
        const hasMethods = await PaymentMethod.exists({
            user: userId,
        });
        return PaymentMethod.create({
            user: userId,
            type: "card",
            label: "Debit / Credit Card",
            value: `•••• •••• •••• ${last4}`,
            last4,
            isDefault: !hasMethods,
        });
    }
    static async setDefault(userId: string, methodId: string) {
        const method = await PaymentMethod.findOne({ _id: methodId, user: userId });
        if (!method) throw new Error("Payment method not found.");
        await PaymentMethod.updateMany(
            { user: userId, _id: { $ne: methodId } },
            { $set: { isDefault: false } },
        );
        method.isDefault = true;
        await method.save();
        return method;
    }
    static async deleteMethod(userId: string, methodId: string) {
        const method = await PaymentMethod.findOne({ _id: methodId, user: userId });
        if (!method) throw new Error("Payment method not found.");
        const wasDefault = method.isDefault;
        await PaymentMethod.deleteOne({ _id: methodId, user: userId });
        if (wasDefault) {
            const nextMethod = await PaymentMethod.findOne({ user: userId }).sort({ createdAt: -1 });
            if (nextMethod) {
                nextMethod.isDefault = true;
                await nextMethod.save();
            }
        }
        return true;
    }
}