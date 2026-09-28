import { Document, Schema, model } from "mongoose";
export type PaymentMethodType = "upi" | "card";
export interface IPaymentMethod extends Document {
    user: Schema.Types.ObjectId;
    type: PaymentMethodType;
    label: string;
    value: string;
    last4?: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}
const PaymentMethodSchema = new Schema<IPaymentMethod>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["upi", "card"],
            required: true,
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
        // UPI ID for UPI records; masked display value for cards.
        value: {
            type: String,
            required: true,
            trim: true,
        },
        // Never store a full card number or CVV.
        last4: {
            type: String,
            trim: true,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true },
);
PaymentMethodSchema.index({ user: 1, createdAt: -1 });
export default model<IPaymentMethod>("PaymentMethod", PaymentMethodSchema);
