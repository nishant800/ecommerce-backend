import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";


// =========================================
// REPLACEMENT STATUS
// =========================================

export enum ReplacementStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    COMPLETED = "completed",
}


// =========================================
// REPLACEMENT TYPE
// =========================================

export enum ReplacementType {
    SIZE = "size",
    COLOR = "color",
    DESIGN = "design",
}


// =========================================
// REPLACEMENT REQUEST
// =========================================

export interface IReplacementRequest
    extends Document {

    order: mongoose.Types.ObjectId;

    customer: mongoose.Types.ObjectId;

    seller: mongoose.Types.ObjectId;

    orderItemIndex: number;

    product: mongoose.Types.ObjectId;

    replacementType: ReplacementType;

    currentValue: string;

    /*
     * New value is selected physically at the seller.
     * It is not required from the customer when creating
     * the replacement request.
     */
    requestedValue?: string;

    currentProductName: string;

    requestedProductName?: string;

    originalPrice: number;

    replacementPrice: number;

    priceDifference: number;

    sellerAddress: {
        shopName: string;
        address: string;
        area?: string;
        landmark?: string;
        city: string;
        state: string;
        pincode: string;
        country: string;
        phone?: string;
    };

    /*
     * Barcode 1:
     * Customer presents this to the seller to find the
     * exact replacement request.
     */
    verificationBarcode: string;

    /*
     * Barcode 2:
     * Generated automatically only after approval.
     * It is required to complete the replacement.
     */
    securityBarcode: {
        type: String,
        required: false,
        default: undefined,
        unique: true,
        sparse: true,
        trim: true,
        select: false,
    },

    approvedAt?: Date;

    rejectedAt?: Date;

    completedAt?: Date;

    status: ReplacementStatus;

    customerNote?: string;

    sellerNote?: string;

    createdAt: Date;

    updatedAt: Date;
}


// =========================================
// SCHEMA
// =========================================

const ReplacementRequestSchema =
    new Schema<IReplacementRequest>(
        {

            order: {
                type: Schema.Types.ObjectId,
                ref: "Order",
                required: true,
                index: true,
            },

            customer: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            seller: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            orderItemIndex: {
                type: Number,
                required: true,
                min: 0,
            },

            product: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },

            replacementType: {
                type: String,
                enum: Object.values(
                    ReplacementType,
                ),
                required: true,
            },

            currentValue: {
                type: String,
                required: true,
                trim: true,
            },

            requestedValue: {
                type: String,
                default: "",
                trim: true,
            },

            currentProductName: {
                type: String,
                required: true,
                trim: true,
            },

            requestedProductName: {
                type: String,
                default: "",
                trim: true,
            },

            originalPrice: {
                type: Number,
                required: true,
                min: 0,
            },

            replacementPrice: {
                type: Number,
                required: true,
                min: 0,
            },

            priceDifference: {
                type: Number,
                required: true,
                min: 0,
                default: 0,
            },

            sellerAddress: {
                shopName: {
                    type: String,
                    required: true,
                    trim: true,
                },

                address: {
                    type: String,
                    required: true,
                    trim: true,
                },

                area: {
                    type: String,
                    default: "",
                    trim: true,
                },

                landmark: {
                    type: String,
                    default: "",
                    trim: true,
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

                pincode: {
                    type: String,
                    required: true,
                    trim: true,
                },

                country: {
                    type: String,
                    default: "India",
                    trim: true,
                },

                phone: {
                    type: String,
                    default: "",
                    trim: true,
                },
            },

            verificationBarcode: {
                type: String,
                required: true,
                unique: true,
                index: true,
                trim: true,
            },

            securityBarcode: {
                type: String,
                required: false,
                default: undefined,
                unique: true,
                sparse: true,
                trim: true,
                select: false,
            },

            approvedAt: {
                type: Date,
                default: null,
            },

            rejectedAt: {
                type: Date,
                default: null,
            },

            completedAt: {
                type: Date,
                default: null,
            },

            status: {
                type: String,
                enum: Object.values(
                    ReplacementStatus,
                ),
                default:
                    ReplacementStatus.PENDING,
                index: true,
            },

            customerNote: {
                type: String,
                default: "",
                trim: true,
            },

            sellerNote: {
                type: String,
                default: "",
                trim: true,
            },

        },
        {
            timestamps: true,
        },
    );


// =========================================
// MODEL
// =========================================

const ReplacementRequest:
    Model<IReplacementRequest> =
    mongoose.models.ReplacementRequest ||
    mongoose.model<IReplacementRequest>(
        "ReplacementRequest",
        ReplacementRequestSchema,
    );

export default ReplacementRequest;
