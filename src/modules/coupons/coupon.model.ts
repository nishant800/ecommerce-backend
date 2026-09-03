import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICoupon extends Document {
    code: string;
    description?: string;
    discount: number;
    type: "percentage" | "fixed";
    expiresAt: Date;
    usageLimit: number;
    usedCount: number;
    isActive: boolean;
}

const couponSchema = new Schema<ICoupon>(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        discount: {
            type: Number,
            required: true,
        },
        type: {
            type: String,
            enum: ["percentage", "fixed"],
            default: "percentage",
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        usageLimit: {
            type: Number,
            default: 1,
        },
        usedCount: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

const Coupon: Model<ICoupon> = mongoose.model<ICoupon>("Coupon", couponSchema);

export default Coupon;
