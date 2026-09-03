import {
    Request,
    Response,
} from "express";

import {
    BrandService,
} from "./brand.service.js";


export class BrandController {

    // =========================================
    // CREATE
    // =========================================

    static async create(
        req: Request,
        res: Response
    ) {

        try {

            const brand =
                await BrandService.create(
                    req.body
                );

            return res.status(201).json({
                success: true,
                data: brand,
            });

        } catch (error: any) {

            return res.status(400).json({
                success: false,
                message:
                    error.message,
            });
        }
    }


    // =========================================
    // GET ALL
    // =========================================

    static async getAll(
        _req: Request,
        res: Response
    ) {

        try {

            const brands =
                await BrandService.getAll();

            return res.json({
                success: true,
                data: brands,
            });

        } catch (error: any) {

            return res.status(500).json({
                success: false,
                message:
                    error.message,
            });
        }
    }


    // =========================================
    // GET BY ID
    // =========================================

    static async getById(
        req: Request,
        res: Response
    ) {

        try {

            const brand =
                await BrandService.getById(
                    String(
                        req.params.id
                    )
                );

            if (!brand) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Brand not found",
                });
            }

            return res.json({
                success: true,
                data: brand,
            });

        } catch (error: any) {

            return res.status(500).json({
                success: false,
                message:
                    error.message,
            });
        }
    }


    // =========================================
    // UPDATE
    // =========================================

    static async update(
        req: Request,
        res: Response
    ) {

        try {

            const brand =
                await BrandService.update(
                    String(
                        req.params.id
                    ),
                    req.body
                );

            if (!brand) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Brand not found",
                });
            }

            return res.json({
                success: true,
                data: brand,
            });

        } catch (error: any) {

            return res.status(400).json({
                success: false,
                message:
                    error.message,
            });
        }
    }


    // =========================================
    // DELETE / DEACTIVATE
    // =========================================

    static async delete(
        req: Request,
        res: Response
    ) {

        try {

            const brand =
                await BrandService.delete(
                    String(
                        req.params.id
                    )
                );

            if (!brand) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Brand not found",
                });
            }

            return res.json({
                success: true,
                message:
                    "Brand deleted successfully",
                data: brand,
            });

        } catch (error: any) {

            return res.status(500).json({
                success: false,
                message:
                    error.message,
            });
        }
    }
}