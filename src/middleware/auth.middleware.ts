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
        // Role of the CURRENT SESSION/JWT.
        // Example:
        // customer app  -> "customer"
        // seller app    -> "seller"
        role: string;
        // Actual role stored in MongoDB.
        // Example:
        // seller account -> "seller"
        accountRole: string;
    };
}
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // ==========================================
        // 1. Read Authorization header
        // ==========================================
        const header =
            req.headers.authorization;
        if (
            !header ||
            !header.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
                code: "AUTH_REQUIRED",
            });
        }
        // ==========================================
        // 2. Extract JWT token
        // ==========================================
        const token =
            header.split(" ")[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
                code: "AUTH_REQUIRED",
            });
        }
        // ==========================================
        // 3. Verify JWT
        // ==========================================
        let decoded: ReturnType<typeof verifyAccessToken>;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            const name = error instanceof Error ? error.name : '';
            if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(name)) {
                return res.status(401).json({
                    success: false,
                    message: name === 'TokenExpiredError' ? 'Token expired' : 'Invalid Token',
                    code: name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
                });
            }
            throw error;
        }
        // ==========================================
        // 4. Find user in MongoDB
        // ==========================================
        const user =
            await User.findById(
                decoded.userId
            ).select(
                "_id role isActive"
            );
        // ==========================================
        // 5. User must exist
        // ==========================================
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "User account no longer exists",
                code: "AUTH_ACCOUNT_NOT_FOUND",
            });
        }
        // ==========================================
        // 6. User account must be active
        // ==========================================
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message:
                    "This account has been deleted or is inactive",
                code: "AUTH_ACCOUNT_INACTIVE",
            });
        }
        // ==========================================
        // 7. Attach authenticated user
        // ==========================================
        //
        // IMPORTANT:
        //
        // role        = role from JWT/session
        //
        // accountRole = actual MongoDB role
        //
        // This allows the SAME seller account to have:
        //
        // Customer app:
        // JWT role = "customer"
        //
        // Seller app:
        // JWT role = "seller"
        //
        // while MongoDB remains:
        // role = "seller"
        //
        req.user = {
            userId:
                user._id.toString(),
            // Preserve the role from the JWT.
            role:
                decoded.role,
            // Actual role from MongoDB.
            accountRole:
                user.role,
        };
        // ==========================================
        // 8. Continue request
        // ==========================================
        next();
    } catch (error) {
        console.error(
            "❌ AUTHENTICATION FAILED:",
            error
        );
        return res.status(503).json({
            success: false,
            message: "Authentication service temporarily unavailable",
            code: "AUTH_SERVICE_UNAVAILABLE",
        });
    }
};