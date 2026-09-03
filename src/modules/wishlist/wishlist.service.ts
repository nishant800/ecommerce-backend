import mongoose from "mongoose";

import Wishlist from "./wishlist.model.js";
import Product from "../products/product.model.js";

export class WishlistService {
    // =========================================
    // GET WISHLIST
    // =========================================

    static async getWishlist(userId: string) {
        let wishlist = await Wishlist.findOne({
            user: userId,
        }).populate("items.product");

        if (!wishlist) {
            try {
                await Wishlist.create({
                    user: userId,
                    items: [],
                });
            } catch (error: any) {
                // Another request may have created it at the same time.
                // Ignore duplicate-key error and continue.
                if (error?.code !== 11000) {
                    throw error;
                }
            }

            wishlist = await Wishlist.findOne({
                user: userId,
            }).populate("items.product");
        }

        return wishlist;
    }

    // =========================================
    // ADD PRODUCT
    // =========================================

    static async addProduct(
        userId: string,
        productId: string
    ) {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            throw new Error("Invalid product ID");
        }

        const product = await Product.findById(productId);

        if (!product) {
            throw new Error("Product not found");
        }

        try {
            await Wishlist.findOneAndUpdate(
                {
                    user: userId,
                },
                {
                    $setOnInsert: {
                        user: userId,
                    },
                    $addToSet: {
                        items: {
                            product: product._id,
                        },
                    },
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                }
            );
        } catch (error: any) {
            if (error?.code !== 11000) {
                throw error;
            }

            // Retry once if another request created the wishlist
            // at the exact same time.
            await Wishlist.findOneAndUpdate(
                {
                    user: userId,
                },
                {
                    $addToSet: {
                        items: {
                            product: product._id,
                        },
                    },
                }
            );
        }

        return await Wishlist.findOne({
            user: userId,
        }).populate("items.product");
    }

    // =========================================
    // REMOVE PRODUCT
    // =========================================

    static async removeProduct(
        userId: string,
        productId: string
    ) {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            throw new Error("Invalid product ID");
        }

        const wishlist = await Wishlist.findOne({
            user: userId,
        });

        if (!wishlist) {
            throw new Error("Wishlist not found");
        }

        await Wishlist.updateOne(
            {
                _id: wishlist._id,
                user: userId,
            },
            {
                $pull: {
                    items: {
                        product: new mongoose.Types.ObjectId(productId),
                    },
                },
            }
        );

        return await Wishlist.findOne({
            user: userId,
        }).populate("items.product");
    }

    // =========================================
    // TOGGLE PRODUCT
    // =========================================

    static async toggleProduct(
        userId: string,
        productId: string
    ) {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            throw new Error("Invalid product ID");
        }

        const product = await Product.findById(productId);

        if (!product) {
            throw new Error("Product not found");
        }

        let wishlist = await Wishlist.findOne({
            user: userId,
        });

        if (!wishlist) {
            try {
                wishlist = await Wishlist.create({
                    user: userId,
                    items: [],
                });
            } catch (error: any) {
                if (error?.code !== 11000) {
                    throw error;
                }

                wishlist = await Wishlist.findOne({
                    user: userId,
                });
            }
        }

        if (!wishlist) {
            throw new Error("Unable to create wishlist");
        }

        const exists = wishlist.items.some(
            (item) =>
                item.product.toString() === productId
        );

        if (exists) {
            await Wishlist.updateOne(
                {
                    _id: wishlist._id,
                    user: userId,
                },
                {
                    $pull: {
                        items: {
                            product: new mongoose.Types.ObjectId(productId),
                        },
                    },
                }
            );
        } else {
            await Wishlist.updateOne(
                {
                    _id: wishlist._id,
                    user: userId,
                },
                {
                    $addToSet: {
                        items: {
                            product: product._id,
                        },
                    },
                }
            );
        }

        return await Wishlist.findOne({
            user: userId,
        }).populate("items.product");
    }
}