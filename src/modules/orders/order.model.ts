import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";

// =========================================
// ORDER STATUS
// =========================================

export enum OrderStatus {
    PENDING = "pending",
    SHIPPED = "shipped",
    DELIVERED = "delivered",
    CANCELLED = "cancelled",
}

// =========================================
// PAYMENT STATUS
// =========================================

export enum PaymentStatus {
    PENDING = "pending",
    SUCCESS = "success",
    FAILED = "failed",
}

// =========================================
// REFUND STATUS
// =========================================

export enum RefundStatus {
    NONE = "none",
    PENDING = "pending",
    PROCESSED = "processed",
    FAILED = "failed",
}

// =========================================
// ORDER ITEM
// =========================================

export interface IOrderItem {
    product: mongoose.Types.ObjectId;

    // Seller who owns this product
    seller: mongoose.Types.ObjectId;

    name: string;
    image: string;

    // =====================================
    // PRICE SNAPSHOT
    // =====================================

    // Original product price when order was placed
    basePrice: number;

    // Final/discounted product price when order was placed
    discountPrice: number;

    // Final unit price used for order calculation
    price: number;

    quantity: number;

    // Variant information
    variant?: {
        color?: string;
        size?: string;
        design?: string;
        strap?: string;
        style?: string;
        shade?: string;
        volume?: string;
        material?: string;
        sku?: string;

        // Selected child option snapshot
        // Bangle -> size
        // Cosmetic -> shade
        // Other selectable child option
        optionType?: string;
        optionValue?: string;
    };
}

// =========================================
// SHIPPING ADDRESS
// =========================================

export interface IShippingAddress {
    fullName: string;
    phone: string;
    pincode: string;
    house: string;
    area: string;
    landmark?: string;
    city: string;
    state: string;
    country: string;
}

// =========================================
// ORDER
// =========================================

export interface IOrder extends Document {
    user: mongoose.Types.ObjectId;

    items: IOrderItem[];

    shippingAddress: IShippingAddress;

    subtotal: number;
    shippingCharge: number;
    discount: number;
    tax: number;
    total: number;

    paymentMethod: string;

    paymentStatus: PaymentStatus;

    orderStatus: OrderStatus;

    // =====================================
    // SHIPPING LABEL
    // =====================================

    shippingLabelGeneratedAt?: Date;

    shippedAt?: Date;
    deliveredAt?: Date;
    // =====================================
    // RAZORPAY
    // =====================================

    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;

    // =====================================
    // REFUND
    // =====================================

    refundStatus: RefundStatus;
    refundId?: string;
    refundedAmount?: number;
    refundedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
    refundWebhookEventIds?: string[];
}

// =========================================
// ORDER ITEM SCHEMA
// =========================================

const OrderItemSchema = new Schema<IOrderItem>(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        // Seller who owns this product
        seller: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        image: {
            type: String,
            default: "",
        },

        // =====================================
        // PRICE SNAPSHOT
        // =====================================

        basePrice: {
            type: Number,
            required: true,
            min: 0,
        },

        discountPrice: {
            type: Number,
            required: true,
            min: 0,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        // =====================================
        // VARIANT
        // =====================================

        variant: {
            color: {
                type: String,
                default: "",
            },

            size: {
                type: String,
                default: "",
            },

            design: {
                type: String,
                default: "",
            },

            strap: {
                type: String,
                default: "",
            },

            style: {
                type: String,
                default: "",
            },

            shade: {
                type: String,
                default: "",
            },

            volume: {
                type: String,
                default: "",
            },

            material: {
                type: String,
                default: "",
            },

            sku: {
                type: String,
                default: "",
            },

            // Selected child option snapshot
            optionType: {
                type: String,
                default: "",
            },

            optionValue: {
                type: String,
                default: "",
            },
        },
    },
    {
        _id: false,
    }
);

// =========================================
// SHIPPING ADDRESS SCHEMA
// =========================================

const ShippingAddressSchema =
    new Schema<IShippingAddress>(
        {
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

            area: {
                type: String,
                required: true,
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

            country: {
                type: String,
                required: true,
                trim: true,
                default: "India",
            },
        },
        {
            _id: false,
        }
    );

// =========================================
// ORDER SCHEMA
// =========================================

const OrderSchema = new Schema<IOrder>(
    {
        // =====================================
        // CUSTOMER
        // =====================================

        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // =====================================
        // PRODUCTS
        // =====================================

        items: {
            type: [OrderItemSchema],
            required: true,

            validate: {
                validator: (
                    value: IOrderItem[]
                ) => value.length > 0,

                message:
                    "Order must contain at least one item",
            },
        },

        // =====================================
        // SHIPPING ADDRESS
        // =====================================

        shippingAddress: {
            type: ShippingAddressSchema,
            required: true,
        },

        // =====================================
        // PRICE DETAILS
        // =====================================

        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },

        shippingCharge: {
            type: Number,
            default: 0,
            min: 0,
        },

        discount: {
            type: Number,
            default: 0,
            min: 0,
        },

        tax: {
            type: Number,
            default: 0,
            min: 0,
        },

        total: {
            type: Number,
            required: true,
            min: 0,
        },

        // =====================================
        // PAYMENT
        // =====================================

        paymentMethod: {
            type: String,
            default: "COD",
            trim: true,
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PaymentStatus),
            default: PaymentStatus.PENDING,
        },

        // =====================================
        // ORDER STATUS
        // =====================================

        orderStatus: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.PENDING,
        },

        // =====================================
        // SHIPPING LABEL
        // =====================================

        shippingLabelGeneratedAt: {
            type: Date,
            default: null,
        },

        shippedAt: {
            type: Date,
            default: null,
        },

        deliveredAt: {
            type: Date,
            default: null,
        },

        // =====================================
        // RAZORPAY
        // =====================================

        razorpayOrderId: {
            type: String,
            default: "",
        },

        razorpayPaymentId: {
            type: String,
            default: "",
        },

        razorpaySignature: {
            type: String,
            default: "",
        },

        // =====================================
        // REFUND
        // =====================================

        refundStatus: {
            type: String,
            enum: Object.values(RefundStatus),
            default: RefundStatus.NONE,
        },

        refundId: {
            type: String,
            default: "",
        },

        refundedAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        refundedAt: {
            type: Date,
            default: null,
        },
        refundWebhookEventIds: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

// =========================================
// MODEL
// =========================================

const Order: Model<IOrder> =
    mongoose.models.Order ||
    mongoose.model<IOrder>(
        "Order",
        OrderSchema
    );

export default Order;