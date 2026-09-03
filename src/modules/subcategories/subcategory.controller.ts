import {
    Request,
    Response,
} from "express";

import {
    SubcategoryService,
} from "./subcategory.service.js";

export class SubcategoryController {

    static async create(
        req: Request,
        res: Response
    ) {
        try {
            const subcategory =
                await SubcategoryService.create(
                    req.body
                );

            return res.status(201).json({
                success: true,
                data: subcategory,
            });
        } catch (err: any) {
            return res.status(400).json({
                success: false,
                message:
                    err.message,
            });
        }
    }

    static async getAll(
        req: Request,
        res: Response
    ) {
        try {
            const category =
                req.query.category
                    ? String(
                        req.query.category
                    )
                    : undefined;

            const subcategories =
                await SubcategoryService.getAll(
                    category
                );

            return res.json({
                success: true,
                data: subcategories,
            });
        } catch (err: any) {
            return res.status(500).json({
                success: false,
                message:
                    err.message ||
                    "Failed to load subcategories",
            });
        }
    }

    static async getById(
        req: Request,
        res: Response
    ) {
        try {
            const subcategory =
                await SubcategoryService.getById(
                    String(
                        req.params.id
                    )
                );

            if (!subcategory) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Subcategory not found",
                });
            }

            return res.json({
                success: true,
                data: subcategory,
            });
        } catch (err: any) {
            return res.status(500).json({
                success: false,
                message:
                    err.message ||
                    "Failed to load subcategory",
            });
        }
    }

    static async update(
        req: Request,
        res: Response
    ) {
        try {
            const subcategory =
                await SubcategoryService.update(
                    String(
                        req.params.id
                    ),
                    req.body
                );

            if (!subcategory) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Subcategory not found",
                });
            }

            return res.status(200).json({
                success: true,
                data: subcategory,
            });
        } catch (err: any) {
            return res.status(400).json({
                success: false,
                message:
                    err.message,
            });
        }
    }

    static async delete(
        req: Request,
        res: Response
    ) {
        try {
            const subcategory =
                await SubcategoryService.delete(
                    String(
                        req.params.id
                    )
                );

            if (!subcategory) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Subcategory not found",
                });
            }

            return res.json({
                success: true,
                message:
                    "Subcategory deleted successfully",
            });
        } catch (err: any) {
            return res.status(500).json({
                success: false,
                message:
                    err.message ||
                    "Failed to delete subcategory",
            });
        }
    }
}