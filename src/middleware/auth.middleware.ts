import {
    Request,
    Response,
    NextFunction,
} from "express";

import { verifyAccessToken } from "../modules/auth/jwt.js";
import User from "../modules/users/user.model.js";

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        console.log('====== RAW HEADERS ======');
        console.log(req.headers);

        console.log(
            'AUTH:',
            req.headers.authorization,
        );

        console.log(
            'DEBUG:',
            req.headers['x-order-debug'],
        );

        const header =
            req.headers.authorization;

        if (!header?.startsWith("Bearer ")) {
            console.log(
                "❌ NO BEARER TOKEN"
            );

            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const token =
            header.split(" ")[1];

        console.log(
            "TOKEN RECEIVED:",
            token
                ? token.substring(0, 20) + "..."
                : "EMPTY"
        );

        const decoded =
            verifyAccessToken(token);

        console.log(
            "✅ TOKEN VERIFIED:",
            decoded
        );

        // =====================================
        // CHECK USER ACCOUNT STATUS
        // =====================================

        const user =
            await User.findById(
                decoded.userId
            ).select(
                "_id role isActive"
            );

        if (!user) {
            console.log(
                "❌ USER NOT FOUND"
            );

            return res.status(401).json({
                success: false,
                message:
                    "User account no longer exists",
            });
        }

        if (!user.isActive) {
            console.log(
                "❌ USER ACCOUNT INACTIVE"
            );

            return res.status(401).json({
                success: false,
                message:
                    "This account has been deleted or is inactive",
            });
        }

        // =====================================
        // ATTACH AUTHENTICATED USER
        // =====================================

        req.user = {
            userId:
                user._id.toString(),

            role:
                user.role,
        };

        next();

    } catch (error) {

        console.log(
            "❌ AUTHENTICATION FAILED:",
            error
        );

        return res.status(401).json({
            success: false,
            message: "Invalid Token",
        });
    }
};