import User, {
    ISellerBusiness,
} from "../users/user.model.js";

import {
    generateAccessToken,
} from "./jwt.js";

import crypto from "crypto";

import {
    OAuth2Client,
} from "google-auth-library";

import { env } from "../../config/env.js";

import {
    sendPasswordResetOTP,
    sendForgotEmailOTP,
} from "../../utils/email.js";

// =========================================
// REGISTER DATA
// =========================================

interface RegisterData {
    name: string;
    email: string;
    phone: string;
    password: string;
}

// =========================================
// SELLER REGISTER DATA
// =========================================

interface SellerRegisterData
    extends RegisterData {

    business: ISellerBusiness;
}

// =========================================
// LOGIN DATA
// =========================================

interface LoginData {
    email: string;
    password: string;
}

// =========================================
// AUTH SERVICE
// =========================================

export class AuthService {

    private static googleClient =
        new OAuth2Client();


    // =========================================
    // CUSTOMER REGISTER
    // =========================================

    static async register(
        data: RegisterData
    ) {

        const existingUser =
            await User.findOne({
                $or: [
                    {
                        email:
                            data.email,
                    },
                    {
                        phone:
                            data.phone,
                    },
                ],
            });

        if (existingUser) {
            throw new Error(
                "User already exists"
            );
        }

        const user =
            await User.create(data);

        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),

                role:
                    user.role,
            });

        return {
            user,
            token,
        };
    }


    // =========================================
    // SELLER REGISTER
    // =========================================

    static async registerSeller(
        data: SellerRegisterData
    ) {

        // =====================================
        // PERSONAL DETAILS
        // =====================================

        const name =
            data.name?.trim();

        const email =
            data.email
                ?.trim()
                .toLowerCase();

        const phone =
            data.phone?.trim();

        const password =
            data.password;


        // =====================================
        // BASIC VALIDATION
        // =====================================

        if (!name) {
            throw new Error(
                "Name is required"
            );
        }

        if (!email) {
            throw new Error(
                "Email is required"
            );
        }

        if (!phone) {
            throw new Error(
                "Phone number is required"
            );
        }

        if (!password) {
            throw new Error(
                "Password is required"
            );
        }

        if (password.length < 6) {
            throw new Error(
                "Password must be at least 6 characters"
            );
        }


        // =====================================
        // BUSINESS DETAILS
        // =====================================

        const business =
            data.business;


        if (!business) {
            throw new Error(
                "Business details are required"
            );
        }


        const shopName =
            business.shopName
                ?.trim();

        const address =
            business.address
                ?.trim();

        const area =
            business.area
                ?.trim();

        const landmark =
            business.landmark
                ?.trim();

        const city =
            business.city
                ?.trim();

        const state =
            business.state
                ?.trim();

        const pincode =
            business.pincode
                ?.trim();

        const country =
            business.country
                ?.trim() ||
            "India";

        const shopPhone =
            business.shopPhone
                ?.trim() ||
            phone;

        const businessType =
            business.businessType
                ?.trim();

        const gstin =
            business.gstin
                ?.trim()
                .toUpperCase();


        // =====================================
        // BUSINESS VALIDATION
        // =====================================

        if (!shopName) {
            throw new Error(
                "Shop / Business name is required"
            );
        }

        if (!address) {
            throw new Error(
                "Shop address is required"
            );
        }

        if (!city) {
            throw new Error(
                "City is required"
            );
        }

        if (!state) {
            throw new Error(
                "State is required"
            );
        }

        if (!pincode) {
            throw new Error(
                "Pincode is required"
            );
        }


        // =====================================
        // PINCODE VALIDATION
        // =====================================

        if (!/^[0-9]{6}$/.test(pincode)) {
            throw new Error(
                "Please enter a valid 6 digit pincode"
            );
        }


        // =====================================
        // MARKETPLACE SELLER LOCATION RULE
        // =====================================
        // Seller registration is currently available
        // only for the supported Akola service area.
        const normalizedSellerCity =
            city
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();

        const allowedSellerPincodes = [
            "444001",
            "444002",
        ];

        if (
            normalizedSellerCity !== "akola" ||
            !allowedSellerPincodes.includes(pincode)
        ) {
            throw new Error(
                "Seller registration is currently available only in Akola with pincode 444001 or 444002."
            );
        }

        // =====================================
        // CHECK EXISTING USER
        // =====================================

        const existingUser =
            await User.findOne({
                $or: [
                    {
                        email,
                    },
                    {
                        phone,
                    },
                ],
            });


        if (existingUser) {

            if (
                existingUser.email ===
                email
            ) {
                throw new Error(
                    "Email is already registered"
                );
            }

            if (
                existingUser.phone ===
                phone
            ) {
                throw new Error(
                    "Phone number is already registered"
                );
            }

            throw new Error(
                "User already exists"
            );
        }


        // =====================================
        // CREATE SELLER
        // =====================================

        const user =
            await User.create({

                name,

                email,

                phone,

                password,

                role: "seller",

                business: {

                    shopName,

                    address,

                    area:
                        area || "",

                    landmark:
                        landmark || "",

                    city,

                    state,

                    pincode,

                    country,

                    shopPhone,

                    businessType:
                        businessType || "",

                    gstin:
                        gstin || "",
                },
            });


        // =====================================
        // GENERATE TOKEN
        // =====================================

        const token =
            generateAccessToken({

                userId:
                    user._id.toString(),

                role:
                    user.role,
            });


        // =====================================
        // RESPONSE
        // =====================================

        return {

            user,

            token,
        };
    }


    // =========================================
    // LOGIN
    // =========================================

    static async login(
        data: LoginData
    ) {

        const user =
            await User.findOne({
                email:
                    data.email,
            }).select(
                "+password"
            );

        console.log(
            "User:",
            user
        );

        if (!user) {
            throw new Error(
                "Invalid email or password"
            );
        }

        // =====================================
        // ACCOUNT ACTIVE CHECK
        // =====================================

        if (!user.isActive) {
            throw new Error(
                "This account has been deleted or is inactive"
            );
        }

        console.log(
            "Password field:",
            user.password
        );

        const isMatch =
            await user.comparePassword(
                data.password
            );

        console.log(
            "Match:",
            isMatch
        );

        if (!isMatch) {
            throw new Error(
                "Invalid email or password"
            );
        }

        const token =
            generateAccessToken({

                userId:
                    user._id.toString(),

                role:
                    user.role,
            });

        return {
            user,
            token,
        };
    }

    // =========================================
    // SELLER GOOGLE LOGIN
    // =========================================

    static async sellerGoogleLogin(
        idToken: string
    ) {

        if (
            !env.GOOGLE_WEB_CLIENT_ID
        ) {
            throw new Error(
                "Google login is not configured on the server"
            );
        }

        const ticket =
            await this.googleClient
                .verifyIdToken({
                    idToken,
                    audience:
                        env.GOOGLE_WEB_CLIENT_ID,
                });

        const payload =
            ticket.getPayload();

        const email =
            payload?.email
                ?.toLowerCase();


        if (
            !payload ||
            !email ||
            !payload.email_verified
        ) {
            throw new Error(
                "Google could not verify your email address"
            );
        }


        const user =
            await User.findOne({
                email,
            });


        if (
            !user ||
            user.role !== "seller"
        ) {
            throw new Error(
                "No seller account exists for this Google email. Please register first."
            );
        }


        if (!user.isActive) {
            throw new Error(
                "This seller account is inactive"
            );
        }


        const token =
            generateAccessToken({

                userId:
                    user._id.toString(),

                role:
                    user.role,
            });


        return {
            user,
            token,
        };
    }
    // =========================================
    // CUSTOMER GOOGLE LOGIN
    // =========================================

    static async googleLogin(
        idToken: string
    ) {

        if (
            !env.GOOGLE_WEB_CLIENT_ID
        ) {
            throw new Error(
                "Google login is not configured on the server"
            );
        }

        const ticket =
            await this.googleClient
                .verifyIdToken({
                    idToken,

                    audience:
                        env.GOOGLE_WEB_CLIENT_ID,
                });

        const payload =
            ticket.getPayload();

        const email =
            payload?.email
                ?.toLowerCase()
                .trim();


        // =====================================
        // GOOGLE VERIFICATION
        // =====================================

        if (
            !payload ||
            !email ||
            !payload.email_verified
        ) {
            throw new Error(
                "Google could not verify your email address"
            );
        }


        // =====================================
        // FIND CUSTOMER
        // =====================================

        const user =
            await User.findOne({
                email,
            });


        // =====================================
        // ACCOUNT CHECK
        // =====================================

        if (!user) {
            throw new Error(
                "No customer account exists for this Google email. Please register first."
            );
        }


        // =====================================
        // ROLE CHECK
        // =====================================

        if (user.role !== "customer") {
            throw new Error(
                "This Google account is not registered as a customer"
            );
        }


        // =====================================
        // ACTIVE CHECK
        // =====================================

        if (!user.isActive) {
            throw new Error(
                "This customer account is inactive"
            );
        }


        // =====================================
        // GENERATE TOKEN
        // =====================================

        const token =
            generateAccessToken({

                userId:
                    user._id.toString(),

                role:
                    user.role,
            });


        // =====================================
        // RESPONSE
        // =====================================

        return {
            user,
            token,
        };
    }

    // =========================================
    // FORGOT PASSWORD
    // =========================================

    static async forgotPassword(
        email: string
    ) {
        const normalizedEmail =
            email
                .toLowerCase()
                .trim();

        if (!normalizedEmail) {
            throw new Error(
                "Email is required"
            );
        }

        const user =
            await User.findOne({
                email:
                    normalizedEmail,
            }).select(
                "+resetPasswordOTP +resetPasswordOTPExpires"
            );

        if (!user) {
            throw new Error(
                "No account found with this email"
            );
        }

        const otp =
            crypto.randomInt(
                100000,
                1000000,
            ).toString();

        user.resetPasswordOTP =
            otp;

        user.resetPasswordOTPExpires =
            new Date(
                Date.now() +
                10 * 60 * 1000,
            );

        await user.save();

        await (
            sendPasswordResetOTP as any
        )(
            normalizedEmail,
            otp,
        );

        return {
            message:
                "Password reset OTP sent successfully",
        };
    }


    // =========================================
    // VERIFY RESET OTP
    // =========================================

    static async verifyResetOTP(
        email: string,
        otp: string,
    ) {
        const normalizedEmail =
            email
                .toLowerCase()
                .trim();

        const normalizedOTP =
            otp.trim();

        const user =
            await User.findOne({
                email:
                    normalizedEmail,
            }).select(
                "+resetPasswordOTP +resetPasswordOTPExpires"
            );

        if (!user) {
            throw new Error(
                "User not found"
            );
        }

        if (
            !user.resetPasswordOTP ||
            user.resetPasswordOTP !==
            normalizedOTP
        ) {
            throw new Error(
                "Invalid OTP"
            );
        }

        if (
            !user.resetPasswordOTPExpires ||
            user.resetPasswordOTPExpires
                .getTime() <
            Date.now()
        ) {
            throw new Error(
                "OTP has expired"
            );
        }

        return {
            message:
                "OTP verified successfully",
        };
    }


    // =========================================
    // RESET PASSWORD
    // =========================================

    static async resetPassword(
        email: string,
        otp: string,
        newPassword: string,
    ) {
        const normalizedEmail =
            email
                .toLowerCase()
                .trim();

        const normalizedOTP =
            otp.trim();

        if (
            !newPassword ||
            newPassword.length < 6
        ) {
            throw new Error(
                "Password must be at least 6 characters"
            );
        }

        const user =
            await User.findOne({
                email:
                    normalizedEmail,
            }).select(
                "+resetPasswordOTP +resetPasswordOTPExpires +password"
            );

        if (!user) {
            throw new Error(
                "User not found"
            );
        }

        if (
            !user.resetPasswordOTP ||
            user.resetPasswordOTP !==
            normalizedOTP
        ) {
            throw new Error(
                "Invalid OTP"
            );
        }

        if (
            !user.resetPasswordOTPExpires ||
            user.resetPasswordOTPExpires
                .getTime() <
            Date.now()
        ) {
            throw new Error(
                "OTP has expired"
            );
        }

        user.password =
            newPassword;

        user.resetPasswordOTP =
            undefined;

        user.resetPasswordOTPExpires =
            undefined;

        await user.save();

        return {
            message:
                "Password reset successfully",
        };
    }


    // =========================================
    // FORGOT EMAIL
    // =========================================

    static async forgotEmail(
        phone: string,
    ) {
        const normalizedPhone =
            phone.trim();

        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }

        const user =
            await User.findOne({
                phone:
                    normalizedPhone,
            }).select(
                "+forgotEmailOTP +forgotEmailOTPExpires"
            );

        if (!user) {
            throw new Error(
                "No account found with this phone number"
            );
        }

        if (!user.email) {
            throw new Error(
                "No email is associated with this account"
            );
        }

        const otp =
            crypto.randomInt(
                100000,
                1000000,
            ).toString();

        user.forgotEmailOTP =
            otp;

        user.forgotEmailOTPExpires =
            new Date(
                Date.now() +
                10 * 60 * 1000,
            );

        await user.save();

        await (
            sendForgotEmailOTP as any
        )(
            user.email,
            otp,
        );

        return {
            message:
                "Verification OTP sent successfully",
        };
    }


    // =========================================
    // VERIFY FORGOT EMAIL OTP
    // =========================================

    static async verifyForgotEmailOTP(
        phone: string,
        otp: string,
    ) {
        const normalizedPhone =
            phone.trim();

        const normalizedOTP =
            otp.trim();

        const user =
            await User.findOne({
                phone:
                    normalizedPhone,
            }).select(
                "+forgotEmailOTP +forgotEmailOTPExpires"
            );

        if (!user) {
            throw new Error(
                "User not found"
            );
        }

        if (
            !user.forgotEmailOTP ||
            user.forgotEmailOTP !==
            normalizedOTP
        ) {
            throw new Error(
                "Invalid OTP"
            );
        }

        if (
            !user.forgotEmailOTPExpires ||
            user.forgotEmailOTPExpires
                .getTime() <
            Date.now()
        ) {
            throw new Error(
                "OTP has expired"
            );
        }

        const email =
            user.email;

        user.forgotEmailOTP =
            undefined;

        user.forgotEmailOTPExpires =
            undefined;

        await user.save();

        return {
            email,
            message:
                "Email verified successfully",
        };
    }
}