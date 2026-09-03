import { Request, Response, NextFunction } from "express";

export const validateProduct = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    const { name, price, quantity } = req.body;

    if (!name || typeof name !== "string") {
        throw new Error("Product name is required and must be a string.");
    }

    if (price === undefined || typeof price !== "number" || price < 0) {
        throw new Error("Product price is required and must be a non-negative number.");
    }

    if (quantity === undefined || typeof quantity !== "number" || quantity < 0) {
        throw new Error("Product quantity is required and must be a non-negative number.");
    }

    next();
};
