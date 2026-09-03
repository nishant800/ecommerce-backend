import { Request, Response, NextFunction } from "express";

export const validateBrand = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    const { name } = req.body;

    if (!name || typeof name !== "string") {
        throw new Error("Brand name is required and must be a string.");
    }

    next();
};
