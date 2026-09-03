import mongoose, { Schema, Document, Model } from "mongoose";

export enum AddressType {
    HOME = "home",
    WORK = "work",
    OTHER = "other",
}

export interface IAddress extends Document {
    user: mongoose.Types.ObjectId;

    fullName: string;
    phone: string;

    pincode: string;

    house: string;
    area: string;
    landmark?: string;

    city: string;
    state: string;
    country: string;

    type: AddressType;

    isDefault: boolean;
}

const AddressSchema = new Schema<IAddress>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true,
        },

        pincode: {
            type: String,
            required: true,
        },

        house: {
            type: String,
            required: true,
        },

        area: {
            type: String,
            required: true,
        },

        landmark: {
            type: String,
            default: "",
        },

        city: {
            type: String,
            required: true,
        },

        state: {
            type: String,
            required: true,
        },

        country: {
            type: String,
            default: "India",
        },

        type: {
            type: String,
            enum: Object.values(AddressType),
            default: AddressType.HOME,
        },

        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

const Address: Model<IAddress> =
    mongoose.models.Address ||
    mongoose.model<IAddress>("Address", AddressSchema);

export default Address;