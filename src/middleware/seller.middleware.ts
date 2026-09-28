import {
    Response,
    NextFunction,
} from "express";
import {
    AuthRequest,
} from "./auth.middleware.js";
export const sellerOnly = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // =========================================
        // CURRENT SESSION ROLE
        // =========================================
        //
        // This comes from the JWT.
        //
        // Seller app:
        // role = "seller"
        //
        // Customer app:
        // role = "customer"
        //
        // =========================================
        const role =
            req.user?.role;
        // =========================================
        // USER NOT AUTHENTICATED
        // =========================================
        if (!role) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        // =========================================
        // SELLER / ADMIN ACCESS
        // =========================================
        //
        // IMPORTANT:
        //
        // We check req.user.role, NOT
        // req.user.accountRole.
        //
        // Therefore:
        //
        // MongoDB:
        // role = seller
        //
        // Customer session:
        // JWT role = customer
        //
        // Result:
        // ❌ Seller API access denied
        //
        // Seller session:
        // JWT role = seller
        //
        // Result:
        // ✅ Seller API access allowed
        //
        // =========================================
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
        // =========================================
        // AUTHORIZED
        // =========================================
        next();
    } catch (error) {
        console.error(
            "Seller Middleware Error:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Authorization failed",
        });
    }
};