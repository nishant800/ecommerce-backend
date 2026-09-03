import {
    Response,
} from "express";

import {
    AuthRequest,
} from "../auth/middleware/auth.middleware.js";

import {
    ReplacementService,
} from "./replacement.service.js";

import {
    ReplacementType,
} from "./replacement.model.js";


// =========================================
// REPLACEMENT CONTROLLER
// =========================================

export class ReplacementController {


    // =========================================
    // CREATE CUSTOMER REQUEST
    // =========================================

    static async createRequest(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const customerId =
                req.user?.userId;


            if (!customerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const {
                orderId,
                itemIndex,
                replacementType,
                customerNote,
            } = req.body;


            if (
                !orderId ||
                itemIndex === undefined ||
                !replacementType
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Order, item and replacement type are required.",

                });
            }


            const request =
                await ReplacementService.createRequest(

                    customerId,

                    String(
                        orderId,
                    ),

                    Number(
                        itemIndex,
                    ),

                    replacementType as ReplacementType,

                    String(
                        customerNote ||
                        "",
                    ),

                );


            return res.status(201).json({

                success: true,

                message:
                    "Replacement request created successfully.",

                data: request,

            });

        } catch (error: any) {

            console.error(
                "CREATE REPLACEMENT REQUEST ERROR:",
                error,
            );


            return res.status(400).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to create replacement request.",

            });
        }
    }


    // =========================================
    // GET CUSTOMER REQUESTS
    // =========================================

    static async getMyRequests(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const customerId =
                req.user?.userId;


            if (!customerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const requests =
                await ReplacementService
                    .getCustomerRequests(
                        customerId,
                    );


            return res.json({

                success: true,

                data: requests,

            });

        } catch (error: any) {

            console.error(
                "GET REPLACEMENT REQUESTS ERROR:",
                error,
            );


            return res.status(500).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to load replacement requests.",

            });
        }
    }


    // =========================================
    // GET ONE CUSTOMER REQUEST
    // =========================================

    static async getMyRequest(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const customerId =
                req.user?.userId;


            if (!customerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const request =
                await ReplacementService
                    .getCustomerRequest(
                        customerId,
                        String(
                            req.params.id,
                        ),
                    );


            if (!request) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Replacement request not found.",

                });
            }


            return res.json({

                success: true,

                data: request,

            });

        } catch (error: any) {

            console.error(
                "GET REPLACEMENT REQUEST ERROR:",
                error,
            );


            return res.status(400).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to load replacement request.",

            });
        }
    }


    // =========================================
    // GET SELLER REQUESTS
    // =========================================

    static async getSellerRequests(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const requests =
                await ReplacementService
                    .getSellerRequests(
                        sellerId,
                    );


            return res.json({

                success: true,

                data: requests,

            });

        } catch (error: any) {

            console.error(
                "GET SELLER REPLACEMENT REQUESTS ERROR:",
                error,
            );


            return res.status(500).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to load seller replacement requests.",

            });
        }
    }


    // =========================================
    // FIND SELLER REQUEST BY BARCODE
    // =========================================

    static async getSellerRequestByBarcode(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const barcode =
                String(
                    req.params.barcode ||
                    "",
                );


            if (!barcode.trim()) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Barcode is required.",

                });
            }


            const request =
                await ReplacementService
                    .getSellerRequestByBarcode(
                        sellerId,
                        barcode,
                    );


            return res.json({

                success: true,

                data: request,

            });

        } catch (error: any) {

            console.error(
                "SELLER FIND REPLACEMENT ERROR:",
                error,
            );


            return res.status(404).json({

                success: false,

                message:
                    error?.message ||
                    "Replacement request not found.",

            });
        }
    }


    // =========================================
    // APPROVE
    // Barcode 2 is generated automatically.
    // =========================================

    static async approve(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const sellerNote =
                String(
                    req.body?.sellerNote ||
                    "",
                );


            const request =
                await ReplacementService
                    .approve(

                        sellerId,

                        String(
                            req.params.id,
                        ),

                        sellerNote,

                    );


            return res.json({

                success: true,

                message:
                    "Replacement approved and security barcode generated successfully.",

                data: request,

            });

        } catch (error: any) {

            console.error(
                "APPROVE REPLACEMENT ERROR:",
                error,
            );


            return res.status(400).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to approve replacement.",

            });
        }
    }


    // =========================================
    // REJECT
    // =========================================

    static async reject(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const sellerNote =
                String(
                    req.body?.sellerNote ||
                    "",
                );


            const request =
                await ReplacementService
                    .reject(

                        sellerId,

                        String(
                            req.params.id,
                        ),

                        sellerNote,

                    );


            return res.json({

                success: true,

                message:
                    "Replacement request rejected successfully.",

                data: request,

            });

        } catch (error: any) {

            console.error(
                "REJECT REPLACEMENT ERROR:",
                error,
            );


            return res.status(400).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to reject replacement.",

            });
        }
    }


    // =========================================
    // COMPLETE USING BARCODE 2
    // =========================================

    static async complete(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const sellerId =
                req.user?.userId;


            if (!sellerId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized",

                });
            }


            const securityBarcode =
                String(
                    req.body?.securityBarcode ||
                    "",
                );


            const request =
                await ReplacementService
                    .complete(

                        sellerId,

                        String(
                            req.params.id,
                        ),

                        securityBarcode,

                    );


            return res.json({

                success: true,

                message:
                    "Replacement completed successfully.",

                data: request,

            });

        } catch (error: any) {

            console.error(
                "COMPLETE REPLACEMENT ERROR:",
                error,
            );


            return res.status(400).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to complete replacement.",

            });
        }
    }
}