import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBrand extends Document {
    name: string;
    slug: string;
    logo: string;
    description: string;
    isActive: boolean;
}

const BrandSchema = new Schema<IBrand>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        logo: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
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

export default mongoose.model<IBrand>("Brand", BrandSchema);