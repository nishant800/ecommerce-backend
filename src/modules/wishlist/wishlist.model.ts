import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWishlistItem {
    product: mongoose.Types.ObjectId;
}

export interface IWishlist extends Document {
    user: mongoose.Types.ObjectId;
    items: IWishlistItem[];
}

const WishlistSchema = new Schema<IWishlist>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        items: [
            {
                product: {
                    type: Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

const Wishlist: Model<IWishlist> =
    mongoose.models.Wishlist ||
    mongoose.model<IWishlist>("Wishlist", WishlistSchema);

export default Wishlist;