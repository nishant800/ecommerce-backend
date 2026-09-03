import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.js";

export const sellerOnly = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const role = req.user?.role;

        if (!role) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (
            role !== "seller" &&
            role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Seller access required",
            });
        }

        next();
    } catch (error) {
        console.error(
            "Seller Middleware Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Authorization failed",
        });
    }
};