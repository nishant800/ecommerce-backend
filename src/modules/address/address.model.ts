import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";
export enum AddressType {
    HOME = "home",
    WORK = "work",
    OTHER = "other",
}
// =========================================
// GEO LOCATION
// =========================================
export interface IAddressLocation {
    type: "Point";
    // IMPORTANT:
    // GeoJSON order is:
    // [longitude, latitude]
    coordinates: [number, number];
}
// =========================================
// ADDRESS
// =========================================
export interface IAddress extends Document {
    user: mongoose.Types.ObjectId;
    fullName: string;
    phone: string;
    pincode: string;
    house: string;
    // Building / Street / Road
    street?: string;
    area: string;
    landmark?: string;
    city: string;
    state: string;
    country: string;
    type: AddressType;
    // GPS delivery location
    location?: IAddressLocation;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}
// =========================================
// LOCATION SCHEMA
// =========================================
const LocationSchema =
    new Schema<IAddressLocation>(
        {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
                default: "Point",
            },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: (
                        value: number[]
                    ) => {
                        if (
                            !Array.isArray(value) ||
                            value.length !== 2
                        ) {
                            return false;
                        }
                        const [
                            longitude,
                            latitude,
                        ] = value;
                        return (
                            Number.isFinite(
                                longitude
                            ) &&
                            Number.isFinite(
                                latitude
                            ) &&
                            longitude >= -180 &&
                            longitude <= 180 &&
                            latitude >= -90 &&
                            latitude <= 90
                        );
                    },
                    message:
                        "Invalid delivery location coordinates",
                },
            },
        },
        {
            _id: false,
        }
    );
// =========================================
// ADDRESS SCHEMA
// =========================================
const AddressSchema =
    new Schema<IAddress>(
        {
            // =====================================
            // CUSTOMER
            // =====================================
            user: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            // =====================================
            // RECEIVER DETAILS
            // =====================================
            fullName: {
                type: String,
                required: true,
                trim: true,
            },
            phone: {
                type: String,
                required: true,
                trim: true,
            },
            // =====================================
            // ADDRESS
            // =====================================
            pincode: {
                type: String,
                required: true,
                trim: true,
            },
            house: {
                type: String,
                required: true,
                trim: true,
            },
            street: {
                type: String,
                trim: true,
                default: "",
            },
            area: {
                type: String,
                required: true,
                trim: true,
            },
            landmark: {
                type: String,
                trim: true,
                default: "",
            },
            city: {
                type: String,
                required: true,
                trim: true,
            },
            state: {
                type: String,
                required: true,
                trim: true,
            },
            country: {
                type: String,
                trim: true,
                default: "India",
            },
            // =====================================
            // ADDRESS TYPE
            // =====================================
            type: {
                type: String,
                enum: Object.values(
                    AddressType
                ),
                default:
                    AddressType.HOME,
            },
            // =====================================
            // DELIVERY GPS LOCATION
            // =====================================
            location: {
                type: LocationSchema,
                default: undefined,
            },
            // =====================================
            // DEFAULT ADDRESS
            // =====================================
            isDefault: {
                type: Boolean,
                default: false,
            },
        },
        {
            timestamps: true,
        }
    );
// =========================================
// INDEXES
// =========================================
// Useful for:
// - finding customer addresses
// - default address lookup
AddressSchema.index({
    user: 1,
    isDefault: -1,
});
// GeoJSON index.
//
// Later we can use this for:
// - delivery distance
// - serviceable areas
// - nearby delivery partners
// - seller/customer distance
AddressSchema.index({
    location: "2dsphere",
});
// =========================================
// MODEL
// =========================================
const Address: Model<IAddress> =
    mongoose.models.Address ||
    mongoose.model<IAddress>(
        "Address",
        AddressSchema
    );
export default Address;