import Product, {
    IProduct,
} from "./product.model.js";
import Category from "../categories/category.model.js";
import Subcategory from "../subcategories/subcategory.model.js";
import Brand from "../brands/brand.model.js";
import {
    NotificationService,
} from "../../notifications/notification.service.js";
import {
    NotificationType,
} from "../../notifications/notification.model.js";
export interface ProductQuery {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    subcategory?: string;
    brand?: string;
    featured?: string;
    trending?: string;
    sort?:
    | "latest"
    | "price_asc"
    | "price_desc"
    | "rating";
}
// =========================================
// VALIDATE CATEGORY / SUBCATEGORY / BRAND
// =========================================
const validateCatalogData = async (
    data: Partial<IProduct>
) => {
    // =====================================
    // CATEGORY
    // =====================================
    if (!data.category) {
        throw new Error(
            "Category is required."
        );
    }
    const category =
        await Category.findOne({
            _id: data.category,
            isActive: true,
        });
    if (!category) {
        throw new Error(
            "Selected category is not available."
        );
    }
    // =====================================
    // SUBCATEGORY
    // =====================================
    if (!data.subcategory) {
        throw new Error(
            "Subcategory is required."
        );
    }
    const subcategory =
        await Subcategory.findOne({
            _id: data.subcategory,
            category: data.category,
            isActive: true,
        });
    if (!subcategory) {
        throw new Error(
            "Selected subcategory is not available for this category."
        );
    }
    // =====================================
    // BRAND
    // =====================================
    if (!data.brand) {
        throw new Error(
            "Brand is required."
        );
    }
    const brand =
        await Brand.findOne({
            _id: data.brand,
            isActive: true,
        });
    if (!brand) {
        throw new Error(
            "Selected brand is not available."
        );
    }
    // =====================================
    // CUSTOMER POLICY
    // =====================================
    if (
        data.replacementWindowDays !==
        undefined
    ) {
        if (
            data.replacementWindowDays <
            0
        ) {
            throw new Error(
                "Replacement window cannot be negative."
            );
        }
    }
    if (
        data.replacementReasons !==
        undefined
    ) {
        if (
            !Array.isArray(
                data.replacementReasons
            )
        ) {
            throw new Error(
                "Replacement reasons must be an array."
            );
        }
    }
};
// =========================================
// OFFER DETECTION
// =========================================
const isDiscounted = (
    price: unknown,
    discountPrice: unknown
): boolean => {
    const originalPrice =
        Number(price || 0);
    const offerPrice =
        Number(discountPrice || 0);
    return (
        originalPrice > 0 &&
        offerPrice > 0 &&
        offerPrice < originalPrice
    );
};
const hasActiveOffer = (
    product: Partial<IProduct>
): boolean => {
    // Product must be active to advertise an offer.
    if (product.active === false) {
        return false;
    }
    // =====================================
    // MAIN PRODUCT OFFER
    // =====================================
    if (
        isDiscounted(
            product.price,
            product.discountPrice
        )
    ) {
        return true;
    }
    // =====================================
    // VARIANT OFFER
    // =====================================
    if (
        Array.isArray(
            product.variants
        )
    ) {
        return product.variants.some(
            (variant) =>
                isDiscounted(
                    variant.price,
                    variant.discountPrice
                )
        );
    }
    return false;
};
// =========================================
// CUSTOMER OFFER NOTIFICATION
// =========================================
const sendOfferNotification = (
    product: IProduct
) => {
    void NotificationService
        .broadcastToCustomers({
            type:
                NotificationType.OFFER,
            title:
                "New Offer 🎉",
            message:
                `A new offer is available on ${product.name}. Check it out now!`,
            data: {
                productId:
                    String(product._id),
            },
        })
        .catch((error) => {
            console.error(
                "OFFER NOTIFICATION ERROR:",
                error
            );
        });
};
// =========================================
// PRODUCT SERVICE
// =========================================
export class ProductService {
    // =========================================
    // CREATE PRODUCT
    // =========================================
    static async create(
        data: Partial<IProduct>
    ) {
        await validateCatalogData(
            data
        );
        const existing =
            await Product.findOne({
                $or: [
                    {
                        slug: data.slug,
                    },
                    {
                        sku: data.sku,
                    },
                ],
            });
        if (existing) {
            throw new Error(
                "Product already exists."
            );
        }
        const product =
            await Product.create(
                data
            );
        // =====================================
        // OFFER NOTIFICATION
        // =====================================
        // A newly created discounted product
        // should also generate an offer alert.
        if (
            hasActiveOffer(product)
        ) {
            sendOfferNotification(
                product
            );
        }
        return product;
    }
    // =========================================
    // GET ALL PRODUCTS
    // =========================================
    static async getAll(
        query: ProductQuery
    ) {
        const {
            page = 1,
            limit = 10,
            search,
            category,
            subcategory,
            brand,
            featured,
            trending,
            sort = "latest",
        } = query;
        const filter: any = {
            active: true,
        };
        if (search) {
            filter.name = {
                $regex: search,
                $options: "i",
            };
        }
        if (category) {
            filter.category =
                category;
        }
        if (subcategory) {
            filter.subcategory =
                subcategory;
        }
        if (brand) {
            filter.brand =
                brand;
        }
        if (featured === "true") {
            filter.featured = true;
        }
        if (trending === "true") {
            filter.trending = true;
        }
        let sortQuery: any = {};
        switch (sort) {
            case "price_asc":
                sortQuery.price = 1;
                break;
            case "price_desc":
                sortQuery.price = -1;
                break;
            case "rating":
                sortQuery.rating = -1;
                break;
            default:
                sortQuery.createdAt = -1;
        }
        const total =
            await Product.countDocuments(
                filter
            );
        const products =
            await Product.find(
                filter
            )
                .populate(
                    "category"
                )
                .populate(
                    "subcategory"
                )
                .populate(
                    "brand"
                )
                .populate(
                    "seller",
                    "name email phone"
                )
                .sort(
                    sortQuery
                )
                .skip(
                    (page - 1) * limit
                )
                .limit(
                    limit
                );
        return {
            total,
            page,
            pages:
                Math.ceil(
                    total / limit
                ),
            products,
        };
    }
    // =========================================
    // GET SELLER PRODUCTS
    // =========================================
    static async getSellerProducts(
        sellerId: string
    ) {
        const filter = {
            seller: sellerId,
        };
        const total =
            await Product.countDocuments(
                filter
            );
        const products =
            await Product.find(
                filter
            )
                .populate(
                    "category"
                )
                .populate(
                    "subcategory"
                )
                .populate(
                    "brand"
                )
                .sort({
                    createdAt: -1,
                });
        return {
            total,
            page: 1,
            pages: 1,
            products,
        };
    }
    // =========================================
    // GET PRODUCT BY ID
    // =========================================
    static async getById(
        id: string
    ) {
        return Product.findById(
            id
        )
            .populate(
                "category"
            )
            .populate(
                "subcategory"
            )
            .populate(
                "brand"
            )
            .populate(
                "seller",
                "name email phone"
            );
    }
    // =========================================
    // UPDATE SELLER PRODUCT
    // =========================================
    static async updateSellerProduct(
        id: string,
        sellerId: string,
        data: Partial<IProduct>
    ) {
        // =====================================
        // GET CURRENT PRODUCT
        // =====================================
        const existingProduct =
            await Product.findOne({
                _id: id,
                seller: sellerId,
            });
        if (!existingProduct) {
            return null;
        }
        const wasOnOffer =
            hasActiveOffer(
                existingProduct
            );
        // Prevent seller ownership
        // from being changed.
        const {
            seller,
            ...updateData
        } = data;
        // =====================================
        // VALIDATE CATALOG DATA
        // =====================================
        await validateCatalogData(
            updateData
        );
        const product =
            await Product.findOneAndUpdate(
                {
                    _id: id,
                    seller: sellerId,
                },
                {
                    $set: updateData,
                },
                {
                    new: true,
                    runValidators: true,
                }
            )
                .populate(
                    "category"
                )
                .populate(
                    "subcategory"
                )
                .populate(
                    "brand"
                );
        if (!product) {
            return null;
        }
        const isNowOnOffer =
            hasActiveOffer(
                product
            );
        // =====================================
        // NEW OFFER DETECTED
        // =====================================
        // Send notification only when the product
        // changes from no-offer to offer.
        //
        // Example:
        // ₹500 → ₹0      = no offer
        // ₹500 → ₹399    = NEW OFFER ✅
        //
        // ₹399 → ₹349    = already on offer,
        //                    no duplicate notification
        if (
            !wasOnOffer &&
            isNowOnOffer
        ) {
            sendOfferNotification(
                product
            );
        }
        return product;
    }
    // =========================================
    // DELETE SELLER PRODUCT
    // =========================================
    static async deleteSellerProduct(
        id: string,
        sellerId: string
    ) {
        return Product.findOneAndDelete({
            _id: id,
            seller: sellerId,
        });
    }
    // =========================================
    // OLD UPDATE METHOD
    // =========================================
    static async update(
        id: string,
        data: Partial<IProduct>
    ) {
        return Product.findByIdAndUpdate(
            id,
            {
                $set: data,
            },
            {
                new: true,
                runValidators: true,
            }
        );
    }
    // =========================================
    // OLD DELETE METHOD
    // =========================================
    static async delete(
        id: string
    ) {
        return Product.findByIdAndDelete(
            id
        );
    }
}