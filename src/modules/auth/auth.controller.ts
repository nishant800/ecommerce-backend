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
    // SELLER FIREBASE SOCIAL LOGIN
    static async sellerFirebaseLogin(req: Request, res: Response) {
        try {
            const { firebaseIdToken } = req.body;
            if (!firebaseIdToken) {
                return res.status(400).json({
                    success: false,
                    message: "Firebase ID token is required",
                });
            }
            const result = await AuthService.sellerFirebaseLogin(firebaseIdToken);
            return res.status(200).json({
                success: true,
                message: "Firebase seller login successful",
                data: result,
            });
        } catch (error: any) {
            console.error("Firebase Seller Login Error:", error);
            return res.status(401).json({
                success: false,
                message: error.message || "Firebase seller login failed",
            });
        }
    }
    // =========================================
    // SELLER FIREBASE SOCIAL REGISTER
    // GOOGLE / FACEBOOK
    // =========================================
    static async sellerFirebaseRegister(
        req: Request,
        res: Response
    ) {
        try {
            const {
                firebaseIdToken,
                phone,
                business,
                name,
                email,
            } = req.body;
            if (!firebaseIdToken) {
                return res.status(400).json({
                    success: false,
                    message: "Firebase ID token is required",
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number is required for seller registration",
                });
            }
            if (!business) {
                return res.status(400).json({
                    success: false,
                    message: "Business details are required",
                });
            }
            const result =
                await AuthService.sellerFirebaseRegister(
                    firebaseIdToken,
                    phone,
                    business,
                    name,
                    email,
                );
            return res.status(201).json({
                success: true,
                message: "Seller Firebase registration successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Seller Firebase Registration Error:",
                error,
            );
            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Seller Firebase registration failed",
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
    // =========================================
    // CUSTOMER GOOGLE REGISTER
    // =========================================
    static async googleRegister(
        req: Request,
        res: Response
    ) {
        try {
            const {
                idToken,
                phone,
            } = req.body;
            if (!idToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Google ID token is required",
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is required for Google registration",
                });
            }
            const result =
                await AuthService.googleRegister(
                    idToken,
                    phone
                );
            return res.status(201).json({
                success: true,
                message:
                    "Google registration successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Customer Google Registration Error:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Google registration failed",
            });
        }
    }
    // =========================================
    // FIREBASE SOCIAL LOGIN
    // =========================================
    static async firebaseLogin(
        req: Request,
        res: Response
    ) {
        try {
            const {
                firebaseIdToken,
            } = req.body;
            if (!firebaseIdToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Firebase ID token is required",
                });
            }
            const result =
                await AuthService.firebaseLogin(
                    firebaseIdToken
                );
            return res.status(200).json({
                success: true,
                message:
                    "Firebase login successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Firebase Social Login Error:",
                error
            );
            return res.status(401).json({
                success: false,
                message:
                    error.message ||
                    "Firebase login failed",
            });
        }
    }
    // =========================================
    // FIREBASE SOCIAL REGISTER
    // =========================================
    static async firebaseRegister(
        req: Request,
        res: Response
    ) {
        try {
            const {
                firebaseIdToken,
                phone,
                name,
                email,
            } = req.body;
            if (!firebaseIdToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Firebase ID token is required",
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is required for registration",
                });
            }
            const result =
                await AuthService.firebaseRegister(
                    firebaseIdToken,
                    phone,
                    name,
                    email
                );
            return res.status(201).json({
                success: true,
                message:
                    "Firebase registration successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Firebase Social Registration Error:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Firebase registration failed",
            });
        }
    }
    // =========================================
    // CUSTOMER FACEBOOK LOGIN
    // =========================================
    static async facebookLogin(
        req: Request,
        res: Response
    ) {
        try {
            const {
                accessToken,
            } = req.body;
            if (!accessToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Facebook access token is required",
                });
            }
            const result =
                await AuthService.facebookLogin(
                    accessToken
                );
            return res.status(200).json({
                success: true,
                message:
                    "Facebook login successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Customer Facebook Login Error:",
                error
            );
            return res.status(401).json({
                success: false,
                message:
                    error.message ||
                    "Facebook login failed",
            });
        }
    }
    // =========================================
    // CUSTOMER FACEBOOK REGISTER
    // =========================================
    static async facebookRegister(
        req: Request,
        res: Response
    ) {
        try {
            const {
                accessToken,
                phone,
                name,
                email,
            } = req.body;
            if (!accessToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Facebook access token is required",
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is required for Facebook registration",
                });
            }
            const result =
                await AuthService.facebookRegister(
                    accessToken,
                    phone,
                    name,
                    email
                );
            return res.status(201).json({
                success: true,
                message:
                    "Facebook registration successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Customer Facebook Registration Error:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Facebook registration failed",
            });
        }
    }
    // =========================================
    // CUSTOMER APPLE LOGIN
    // =========================================
    static async appleLogin(
        req: Request,
        res: Response
    ) {
        try {
            const {
                identityToken,
            } = req.body;
            if (!identityToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Apple identity token is required",
                });
            }
            const result =
                await AuthService.appleLogin(
                    identityToken
                );
            return res.status(200).json({
                success: true,
                message:
                    "Apple login successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Customer Apple Login Error:",
                error
            );
            return res.status(401).json({
                success: false,
                message:
                    error.message ||
                    "Apple login failed",
            });
        }
    }
    // =========================================
    // CUSTOMER APPLE REGISTER
    // =========================================
    static async appleRegister(
        req: Request,
        res: Response
    ) {
        try {
            const {
                identityToken,
                phone,
                name,
                email,
            } = req.body;
            if (!identityToken) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Apple identity token is required",
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is required for Apple registration",
                });
            }
            const result =
                await AuthService.appleRegister(
                    identityToken,
                    phone,
                    name,
                    email
                );
            return res.status(201).json({
                success: true,
                message:
                    "Apple registration successful",
                data: result,
            });
        } catch (error: any) {
            console.error(
                "Customer Apple Registration Error:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Apple registration failed",
            });
        }
    }
}
