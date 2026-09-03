import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export interface JwtPayload {
    userId: string;
    role: string;
}

export const generateAccessToken = (payload: JwtPayload): string => {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: "7d",
    });
};

export const verifyAccessToken = (token: string): JwtPayload => {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};