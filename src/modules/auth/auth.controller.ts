import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import User from "../users/user.model.js";

export class AuthController {
    static async register(
        req: Request,
        res: Response
    ) {
        try {
            const result =
                await AuthService.register(req.body);

            res.status(201).json({
                success: true,
                message:
                    "User registered successfully",
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
    static async sellerRegister(
        req: Request,
        res: Response
    ) {
        try {
            const result =
                await AuthService.registerSeller(
                    req.body
                );

            return res.status(201).json({
                success: true,
                message:
                    "Seller account created successfully",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Seller Registration Error:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Unable to create seller account",
            });
        }
    }
    static async login(
        req: Request,
        res: Response
    ) {
        console.log("====== LOGIN HIT ======");
        console.log("Headers:", req.headers);
        console.log("Body:", req.body);

        try {
            const result =
                await AuthService.login(req.body);

            return res.status(200).json({
                success: true,
                message: "Login successful",
                data: result,
            });
        } catch (error: any) {
            console.error(error);

            return res.status(401).json({
                success: false,
                message: error.message,
            });
        }
    }

    static async sellerGoogleLogin(
        req: Request,
        res: Response,
    ) {
        try {
            const { idToken } = req.body;

            if (!idToken) {
                return res.status(400).json({
                    success: false,
                    message: "Google ID token is required",
                });
            }

            const result =
                await AuthService.sellerGoogleLogin(
                    idToken,
                );

            return res.status(200).json({
                success: true,
                message: "Google login successful",
                data: result,
            });
        } catch (error: any) {
            return res.status(401).json({
                success: false,
                message:
                    error.message ||
                    "Google login failed",
            });
        }
    }

    static async forgotPassword(
        req: Request,
        res: Response
    ) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Email is required",
                });
            }

            const result =
                await AuthService.forgotPassword(
                    email
                );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            console.error(
                "Forgot Password Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to process request",
            });
        }
    }

    static async verifyResetOTP(
        req: Request,
        res: Response
    ) {
        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email and OTP are required",
                });
            }

            const result =
                await AuthService.verifyResetOTP(
                    email,
                    otp
                );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    static async resetPassword(
        req: Request,
        res: Response
    ) {
        try {
            const {
                email,
                otp,
                newPassword,
            } = req.body;

            if (
                !email ||
                !otp ||
                !newPassword
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email, OTP and new password are required",
                });
            }

            const result =
                await AuthService.resetPassword(
                    email,
                    otp,
                    newPassword
                );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
    static async forgotEmail(
        req: Request,
        res: Response,
    ) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is required",
                });
            }

            const result =
                await AuthService.forgotEmail(
                    phone,
                );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            console.error(
                "Forgot Email Error:",
                error,
            );

            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    static async verifyForgotEmailOTP(
        req: Request,
        res: Response,
    ) {
        try {
            const {
                phone,
                otp,
            } = req.body;

            if (!phone || !otp) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number and OTP are required",
                });
            }

            const result =
                await AuthService.verifyForgotEmailOTP(
                    phone,
                    otp,
                );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // =========================================
    // GET CURRENT USER / SELLER PROFILE
    // =========================================

    static async me(
        req: Request,
        res: Response
    ) {
        try {
            const userId =
                (req as any).user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const user =
                await User.findById(
                    userId,
                ).select(
                    [
                        "name",
                        "email",
                        "phone",
                        "profileImage",
                        "role",
                        "isVerified",
                        "isActive",
                        "business",
                    ].join(" "),
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            return res.status(200).json({
                success: true,
                user,
            });

        } catch (error) {
            console.error(
                "Get Current User Error:",
                error,
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch user profile",
            });
        }
    }
    // =========================================
    // CUSTOMER GOOGLE LOGIN
    // =========================================

    static async googleLogin(
        req: Request,
        res: Response,
    ) {

        try {

            const {
                idToken,
            } = req.body;


            if (!idToken) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Google ID token is required",
                });
            }


            const result =
                await AuthService.googleLogin(
                    idToken,
                );


            return res.status(200).json({

                success: true,

                message:
                    "Google login successful",

                data:
                    result,
            });

        } catch (error: any) {

            console.error(
                "Customer Google Login Error:",
                error,
            );


            return res.status(401).json({

                success: false,

                message:
                    error.message ||
                    "Google login failed",
            });
        }
    }
}
