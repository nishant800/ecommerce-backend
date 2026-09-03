import Cart, {
    ICartItem,
} from "./cart.model.js";

import Product from "../products/product.model.js";
import mongoose from "mongoose";

export interface CartSelection {
    variantId?: string;
    optionType?: "size" | "shade" | "color" | "";
    optionValue?: string;
}

export class CartService {

    // =========================================
    // GET CART
    // =========================================

    static async getCart(
        userId: string,
    ) {

        let cart =
            await Cart.findOne({
                user: userId,
            }).populate(
                "items.product",
            );


        if (!cart) {

            cart =
                await Cart.create({
                    user: userId,
                    items: [],
                });

            cart =
                await Cart.findOne({
                    user: userId,
                }).populate(
                    "items.product",
                );

        }


        return cart;
    }


    // =========================================
    // FIND AVAILABLE STOCK
    // =========================================

    private static getAvailableStock(
        product: any,
        selection: CartSelection,
    ): number {

        const {
            variantId,
            optionType,
            optionValue,
        } = selection;


        // No variant.
        if (!variantId) {

            return Number(
                product.stock || 0,
            );

        }


        const variant =
            product.variants?.find(
                (item: any) =>
                    String(item._id) ===
                    String(variantId),
            );


        if (!variant) {

            throw new Error(
                "Selected variant is no longer available",
            );

        }

        if (variant.active === false) {
            throw new Error(
                "Selected variant is no longer available",
            );
        }


        // Bangle size.
        if (
            optionType === "size"
        ) {

            const size =
                variant.sizes?.find(
                    (item: any) =>
                        String(item.size) ===
                        String(optionValue),
                );


            if (!size) {

                throw new Error(
                    "Selected bangle size is no longer available",
                );

            }


            return Number(
                size.stock || 0,
            );
        }


        // Cosmetic shade.
        if (
            optionType === "shade"
        ) {

            const shade =
                variant.shades?.find(
                    (item: any) =>
                        String(item.shade) ===
                        String(optionValue),
                );


            if (!shade) {

                throw new Error(
                    "Selected shade is no longer available",
                );

            }


            return Number(
                shade.stock || 0,
            );
        }


        // Watch color option.
        if (
            optionType === "color"
        ) {

            const color =
                variant.colors?.find(
                    (item: any) =>
                        String(item.color) ===
                        String(optionValue),
                );


            if (!color) {

                throw new Error(
                    "Selected color option is no longer available",
                );

            }


            return Number(
                color.stock || 0,
            );
        }


        // Variant without child options.
        return Number(
            variant.stock || 0,
        );
    }


    // =========================================
    // CART ITEM KEY
    // =========================================

    private static sameItem(
        item: ICartItem,
        productId: string,
        selection: CartSelection,
    ) {

        return (
            item.product.toString() ===
            productId &&

            String(
                item.variantId || "",
            ) ===
            String(
                selection.variantId || "",
            ) &&

            String(
                item.optionType || "",
            ) ===
            String(
                selection.optionType || "",
            ) &&

            String(
                item.optionValue || "",
            ) ===
            String(
                selection.optionValue || "",
            )
        );
    }


    // =========================================
    // ADD TO CART
    // =========================================

    static async addToCart(
        userId: string,
        productId: string,
        quantity: number = 1,
        selection: CartSelection = {},
    ) {

        const requestedQuantity =
            Number(quantity);


        if (
            !Number.isInteger(
                requestedQuantity,
            ) ||
            requestedQuantity < 1
        ) {

            throw new Error(
                "Invalid quantity",
            );

        }


        if (!mongoose.isValidObjectId(productId)) {
            throw new Error("Invalid product ID");
        }

        const product =
            await Product.findOne({
                _id: productId,
                active: true,
            });


        if (!product) {

            throw new Error(
                "Product is not available",
            );

        }

        if (product.variants?.length && !selection.variantId) {
            throw new Error(
                "Please select a product variant",
            );
        }


        const availableStock =
            this.getAvailableStock(
                product,
                selection,
            );


        let cart =
            await Cart.findOne({
                user: userId,
            });


        if (!cart) {

            cart =
                await Cart.create({
                    user: userId,
                    items: [],
                });

        }


        const item =
            cart.items.find(
                (cartItem) =>
                    this.sameItem(
                        cartItem,
                        productId,
                        selection,
                    ),
            );


        const newQuantity =
            item
                ? item.quantity +
                requestedQuantity
                : requestedQuantity;


        if (
            newQuantity >
            availableStock
        ) {

            throw new Error(
                `Only ${availableStock} item(s) available for the selected option`,
            );

        }


        if (item) {

            item.quantity =
                newQuantity;

        } else {

            cart.items.push({
                product:
                    product._id,

                variantId:
                    selection.variantId ||
                    "",

                optionType:
                    selection.optionType ||
                    "",

                optionValue:
                    selection.optionValue ||
                    "",

                quantity:
                    requestedQuantity,
            } as ICartItem);

        }


        await cart.save();


        return await Cart.findOne({
            user: userId,
        }).populate(
            "items.product",
        );
    }


    // =========================================
    // UPDATE QUANTITY
    // =========================================

    static async updateQuantity(
        userId: string,
        productId: string,
        quantity: number,
        selection: CartSelection = {},
    ) {

        const requestedQuantity =
            Number(quantity);


        if (
            !Number.isInteger(
                requestedQuantity,
            ) ||
            requestedQuantity < 1
        ) {

            throw new Error(
                "Quantity must be at least 1",
            );

        }


        const cart =
            await Cart.findOne({
                user: userId,
            });


        if (!cart) {

            throw new Error(
                "Cart not found",
            );

        }


        const item =
            cart.items.find(
                (cartItem) =>
                    this.sameItem(
                        cartItem,
                        productId,
                        selection,
                    ),
            );


        if (!item) {

            throw new Error(
                "Product variant not found in cart",
            );

        }


        const product =
            await Product.findById(
                productId,
            );


        if (!product) {

            throw new Error(
                "Product not found",
            );

        }


        const availableStock =
            this.getAvailableStock(
                product,
                selection,
            );


        if (
            requestedQuantity >
            availableStock
        ) {

            throw new Error(
                `Only ${availableStock} item(s) available for the selected option`,
            );

        }


        item.quantity =
            requestedQuantity;


        await cart.save();


        return await Cart.findOne({
            user: userId,
        }).populate(
            "items.product",
        );
    }


    // =========================================
    // REMOVE ITEM
    // =========================================

    static async removeItem(
        userId: string,
        productId: string,
        selection: CartSelection = {},
    ) {

        const cart =
            await Cart.findOne({
                user: userId,
            });


        if (!cart) {

            throw new Error(
                "Cart not found",
            );

        }


        const before =
            cart.items.length;


        cart.items =
            cart.items.filter(
                (item) =>
                    !this.sameItem(
                        item,
                        productId,
                        selection,
                    ),
            );


        if (
            cart.items.length ===
            before
        ) {

            throw new Error(
                "Product variant not found in cart",
            );

        }


        await cart.save();


        return await Cart.findOne({
            user: userId,
        }).populate(
            "items.product",
        );
    }


    // =========================================
    // CLEAR CART
    // =========================================

    static async clearCart(
        userId: string,
    ) {

        const cart =
            await Cart.findOne({
                user: userId,
            });


        if (!cart) {

            throw new Error(
                "Cart not found",
            );

        }


        cart.items = [];


        await cart.save();


        return await Cart.findOne({
            user: userId,
        }).populate(
            "items.product",
        );
    }
}
