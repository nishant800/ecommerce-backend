import { Request, Response, NextFunction } from "express";

export const validateCategory = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    const { name, slug } = req.body;

    if (!name || typeof name !== "string") {
        throw new Error("Category name is required and must be a string.");
    }

    if (!slug || typeof slug !== "string") {
        throw new Error("Category slug is required and must be a string.");
    }

    next();
};
