import { Request, Response } from "express";
import { CategoryService } from "./category.service.js";

export class CategoryController {
    static async create(req: Request, res: Response) {
        try {
            const category = await CategoryService.create(req.body);

            res.status(201).json({
                success: true,
                data: category,
            });
        } catch (err: any) {
            res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }

    static async getAll(_req: Request, res: Response) {
        const categories = await CategoryService.getAll();

        res.json({
            success: true,
            data: categories,
        });
    }

    static async getById(req: Request, res: Response) {
        const category = await CategoryService.getById(
            String(req.params.id)
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found",
            });
        }

        res.json({
            success: true,
            data: category,
        });
    }

    static async update(req: Request, res: Response) {
        console.log(req.params.id);
        console.log(req.body);
        try {
            const category = await CategoryService.update(
                String(req.params.id),
                req.body
            );

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found",
                });
            }

            return res.status(200).json({
                success: true,
                data: category,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
    static async delete(req: Request, res: Response) {
        await CategoryService.delete(String(req.params.id));

        res.json({
            success: true,
            message: "Category deleted successfully",
        });
    }
}