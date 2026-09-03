import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../jwt.js";

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}

export const authenticate = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const header = req.headers.authorization;

        if (!header?.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const token = header.split(" ")[1];

        req.user = verifyAccessToken(token);

        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: "Invalid Token",
        });
    }
};