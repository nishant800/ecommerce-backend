import { Response } from "express";

import {
    AuthRequest,
} from "../../middleware/auth.middleware.js";

import {
    ProductService,
} from "./product.service.js";


export class ProductController {


    // =========================================
    // CREATE PRODUCT
    // =========================================

    static async create(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }


            const product =
                await ProductService.create({

                    ...req.body,

                    seller: sellerId,

                });


            return res.status(201).json({

                success: true,

                data: product,

            });

        } catch (error: any) {

            console.error(
                "CREATE PRODUCT ERROR:",
                error
            );


            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Failed to create product",

            });
        }
    }


    // =========================================
    // GET MY PRODUCTS
    // =========================================

    static async getMyProducts(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message: "Unauthorized",

                });
            }


            const data =
                await ProductService.getSellerProducts(
                    sellerId
                );


            return res.json({

                success: true,

                ...data,

            });

        } catch (error: any) {

            console.error(
                "GET SELLER PRODUCTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Failed to load seller products",

            });
        }
    }


    // =========================================
    // GET ALL PRODUCTS
    // =========================================

    static async getAll(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const data =
                await ProductService.getAll({

                    page:
                        Number(
                            req.query.page
                        ) || 1,


                    limit:
                        Number(
                            req.query.limit
                        ) || 10,


                    search:
                        req.query.search
                            ? String(
                                req.query.search
                            )
                            : undefined,


                    category:
                        req.query.category
                            ? String(
                                req.query.category
                            )
                            : undefined,


                    subcategory:
                        req.query.subcategory
                            ? String(
                                req.query.subcategory
                            )
                            : undefined,


                    brand:
                        req.query.brand
                            ? String(
                                req.query.brand
                            )
                            : undefined,


                    featured:
                        req.query.featured
                            ? String(
                                req.query.featured
                            )
                            : undefined,


                    trending:
                        req.query.trending
                            ? String(
                                req.query.trending
                            )
                            : undefined,


                    sort:
                        req.query.sort
                            ? String(
                                req.query.sort
                            ) as any
                            : undefined,

                });


            return res.json({

                success: true,

                ...data,

            });

        } catch (error: any) {

            console.error(
                "GET PRODUCTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Failed to load products",

            });
        }
    }


    // =========================================
    // GET PRODUCT BY ID
    // =========================================

    static async getById(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const product =
                await ProductService.getById(

                    String(
                        req.params.id
                    )

                );


            if (!product) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found",

                });
            }


            return res.json({

                success: true,

                data: product,

            });

        } catch (error: any) {

            console.error(
                "GET PRODUCT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Failed to load product",

            });
        }
    }


    // =========================================
    // UPDATE PRODUCT
    // =========================================

    static async update(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message: "Unauthorized",

                });
            }


            const product =
                await ProductService.updateSellerProduct(

                    String(
                        req.params.id
                    ),

                    sellerId,

                    req.body

                );


            if (!product) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found or does not belong to this seller",

                });
            }


            return res.json({

                success: true,

                data: product,

            });

        } catch (error: any) {

            console.error(
                "UPDATE PRODUCT ERROR:",
                error
            );


            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Failed to update product",

            });
        }
    }


    // =========================================
    // DELETE PRODUCT
    // =========================================

    static async delete(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message: "Unauthorized",

                });
            }


            const product =
                await ProductService.deleteSellerProduct(

                    String(
                        req.params.id
                    ),

                    sellerId

                );


            if (!product) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Product not found or does not belong to this seller",

                });
            }


            return res.json({

                success: true,

                message:
                    "Product deleted successfully",

            });

        } catch (error: any) {

            console.error(
                "DELETE PRODUCT ERROR:",
                error
            );


            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Failed to delete product",

            });
        }
    }
}