import Product, {
    IProduct,
} from "./product.model.js";

import Category from "../categories/category.model.js";

import Subcategory from "../subcategories/subcategory.model.js";

import Brand from "../brands/brand.model.js";


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


        return await Product.create(
            data
        );
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


        return Product.findOneAndUpdate(

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