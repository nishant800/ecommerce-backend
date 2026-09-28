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
            });
        }
        // ==========================================
        // 3. Verify JWT
        // ==========================================
        const decoded =
            verifyAccessToken(token);
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
        return res.status(401).json({
            success: false,
            message: "Invalid Token",
        });
    }
};