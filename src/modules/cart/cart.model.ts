import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";

export type CartOptionType =
    | "size"
    | "shade"
    | "color"
    | "";

export interface ICartItem {
    product: mongoose.Types.ObjectId;

    // Selected product variant.
    variantId?: string;

    // Selected child option inside the variant.
    // size  -> bangles
    // shade -> cosmetics
    // color -> watches
    optionType?: CartOptionType;

    optionValue?: string;

    quantity: number;
}

export interface ICart extends Document {
    user: mongoose.Types.ObjectId;
    items: ICartItem[];
    createdAt: Date;
    updatedAt: Date;
}

const CartItemSchema =
    new Schema<ICartItem>(
        {
            product: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },

            variantId: {
                type: String,
                default: "",
                trim: true,
            },

            optionType: {
                type: String,
                enum: [
                    "",
                    "size",
                    "shade",
                    "color",
                ],
                default: "",
            },

            optionValue: {
                type: String,
                default: "",
                trim: true,
            },

            quantity: {
                type: Number,
                required: true,
                default: 1,
                min: 1,
            },
        },
        {
            _id: false,
        },
    );

const CartSchema =
    new Schema<ICart>(
        {
            user: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                unique: true,
                index: true,
            },

            items: {
                type: [CartItemSchema],
                default: [],
            },
        },
        {
            timestamps: true,
        },
    );

// Prevent model overwrite during development.
const Cart: Model<ICart> =
    mongoose.models.Cart ||
    mongoose.model<ICart>(
        "Cart",
        CartSchema,
    );

export default Cart;