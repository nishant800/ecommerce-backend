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
import {
    createRemoteJWKSet,
    jwtVerify,
} from "jose";
import { env } from "../../config/env.js";
import {
    sendPasswordResetOTP,
    sendForgotEmailOTP,
} from "../../utils/email.js";
import {
    firebaseAdminAuth,
} from "../../config/firebaseAdmin.js";
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
    // FIREBASE SOCIAL LOGIN
    // =========================================
    static async firebaseLogin(
        firebaseIdToken: string
    ) {
        if (!firebaseIdToken) {
            throw new Error(
                "Firebase ID token is required"
            );
        }
        // =====================================
        // VERIFY FIREBASE ID TOKEN
        // =====================================
        const decodedToken =
            await firebaseAdminAuth.verifyIdToken(
                firebaseIdToken
            );
        const email =
            decodedToken.email
                ?.toLowerCase()
                .trim();
        if (!email) {
            throw new Error(
                "Firebase account email was not provided"
            );
        }
        // =====================================
        // IDENTIFY PROVIDER
        // =====================================
        const provider =
            decodedToken.firebase
                ?.sign_in_provider;
        console.log(
            "🔥 Firebase provider:",
            provider
        );
        // =====================================
        // FIND MONGODB ACCOUNT
        // =====================================
        const user =
            await User.findOne({
                email,
            });
        if (!user) {
            throw new Error(
                "No account exists for this email. Please register first."
            );
        }
        // =====================================
        // ACTIVE CHECK
        // =====================================
        if (!user.isActive) {
            throw new Error(
                "This account is inactive"
            );
        }
        // =====================================
        // CUSTOMER APP ACCOUNT CHECK
        // =====================================
        if (
            user.role !== "customer" &&
            user.role !== "seller"
        ) {
            throw new Error(
                "This account cannot be used in the customer application"
            );
        }
        // =====================================
        // CUSTOMER SESSION
        // =====================================
        //
        // MongoDB role stays unchanged.
        //
        // Example:
        //
        // MongoDB:
        // role = seller
        //
        // Customer app:
        // JWT role = customer
        //
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
            });
        return {
            user,
            token,
        };
    }
    // =========================================
    // FIREBASE SOCIAL REGISTER
    // =========================================
    static async firebaseRegister(
        firebaseIdToken: string,
        phone: string,
        nameFromForm?: string,
        emailFromForm?: string
    ) {
        if (!firebaseIdToken) {
            throw new Error(
                "Firebase ID token is required"
            );
        }
        const normalizedPhone =
            phone?.trim();
        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }
        // =====================================
        // VERIFY FIREBASE TOKEN
        // =====================================
        const decodedToken =
            await firebaseAdminAuth.verifyIdToken(
                firebaseIdToken
            );
        const firebaseEmail =
            decodedToken.email
                ?.toLowerCase()
                .trim();
        const email =
            firebaseEmail ||
            emailFromForm
                ?.trim()
                .toLowerCase();
        if (!email) {
            throw new Error(
                "Email address is required for registration"
            );
        }
        // =====================================
        // NAME
        // =====================================
        const name =
            nameFromForm?.trim() ||
            decodedToken.name?.trim() ||
            email.split("@")[0];
        // =====================================
        // EXISTING EMAIL
        // =====================================
        const existingEmailUser =
            await User.findOne({
                email,
            });
        if (existingEmailUser) {
            throw new Error(
                "An account already exists with this email. Please use Login with Facebook."
            );
        }
        // =====================================
        // EXISTING PHONE
        // =====================================
        const existingPhoneUser =
            await User.findOne({
                phone: normalizedPhone,
            });
        if (existingPhoneUser) {
            throw new Error(
                "This phone number is already registered"
            );
        }
        // =====================================
        // PROFILE IMAGE
        // =====================================
        const profileImage =
            typeof decodedToken.picture === "string"
                ? decodedToken.picture
                : "";
        // =====================================
        // INTERNAL PASSWORD
        // =====================================
        const generatedPassword =
            crypto.randomBytes(32)
                .toString("hex");
        // =====================================
        // CREATE CUSTOMER
        // =====================================
        const user =
            await User.create({
                name,
                email,
                phone: normalizedPhone,
                password: generatedPassword,
                profileImage,
                role: "customer",
                isVerified: false,
                isActive: true,
            });
        // =====================================
        // CUSTOMER JWT
        // =====================================
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
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
            !allowedSellerPincodes.includes(
                pincode
            )
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
        // GENERATE SELLER TOKEN
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
    // SELLER FIREBASE SOCIAL REGISTER
    // GOOGLE / FACEBOOK
    // =========================================
    static async sellerFirebaseRegister(
        firebaseIdToken: string,
        phone: string,
        business: ISellerBusiness,
        nameFromForm?: string,
        emailFromForm?: string,
    ) {
        // =====================================
        // TOKEN VALIDATION
        // =====================================
        if (!firebaseIdToken) {
            throw new Error(
                "Firebase ID token is required"
            );
        }
        // =====================================
        // PHONE VALIDATION
        // =====================================
        const normalizedPhone =
            phone
                ?.trim();
        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }
        // =====================================
        // VERIFY FIREBASE TOKEN
        // =====================================
        const decodedToken =
            await firebaseAdminAuth.verifyIdToken(
                firebaseIdToken
            );
        // =====================================
        // PROVIDER
        // =====================================
        const provider =
            decodedToken
                .firebase
                ?.sign_in_provider;
        console.log(
            "🔥 Seller registration provider:",
            provider
        );
        if (
            provider !== "google.com" &&
            provider !== "facebook.com"
        ) {
            throw new Error(
                "Please register using Google or Facebook."
            );
        }
        // =====================================
        // EMAIL
        // =====================================
        const firebaseEmail =
            decodedToken.email
                ?.toLowerCase()
                .trim();
        const email =
            firebaseEmail ||
            emailFromForm
                ?.trim()
                .toLowerCase();
        if (!email) {
            throw new Error(
                "Email address is required for registration"
            );
        }
        // =====================================
        // VERIFIED EMAIL
        // =====================================
        if (
            provider === "google.com" &&
            decodedToken.email_verified !== true
        ) {
            throw new Error(
                "Google could not verify your email address"
            );
        }
        // =====================================
        // SELLER NAME
        // =====================================
        const name =
            nameFromForm
                ?.trim() ||
            decodedToken.name
                ?.trim() ||
            decodedToken.given_name
                ?.trim() ||
            email.split("@")[0];
        // =====================================
        // PROFILE IMAGE
        // =====================================
        const profileImage =
            decodedToken.picture ||
            "";
        // =====================================
        // BUSINESS VALIDATION
        // =====================================
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
            normalizedPhone;
        const businessType =
            business.businessType
                ?.trim();
        const gstin =
            business.gstin
                ?.trim()
                .toUpperCase();
        // =====================================
        // REQUIRED BUSINESS FIELDS
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
        if (
            !/^[0-9]{6}$/.test(
                pincode
            )
        ) {
            throw new Error(
                "Please enter a valid 6 digit pincode"
            );
        }
        // =====================================
        // SELLER LOCATION RULE
        // =====================================
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
            !allowedSellerPincodes.includes(
                pincode
            )
        ) {
            throw new Error(
                "Seller registration is currently available only in Akola with pincode 444001 or 444002."
            );
        }
        // =====================================
        // EXISTING EMAIL
        // =====================================
        const existingEmailUser =
            await User.findOne({
                email,
            });
        if (existingEmailUser) {
            if (
                existingEmailUser.role ===
                "seller"
            ) {
                throw new Error(
                    "A seller account already exists with this email. Please use Google or Facebook Login."
                );
            }
            throw new Error(
                "An account already exists with this email."
            );
        }
        // =====================================
        // EXISTING PHONE
        // =====================================
        const existingPhoneUser =
            await User.findOne({
                phone:
                    normalizedPhone,
            });
        if (existingPhoneUser) {
            throw new Error(
                "This phone number is already registered."
            );
        }
        // =====================================
        // GENERATE INTERNAL PASSWORD
        // =====================================
        //
        // Social sellers authenticate through
        // Google / Facebook.
        //
        // A random internal password is still
        // generated because the current User
        // schema requires password.
        //
        const generatedPassword =
            crypto
                .randomBytes(32)
                .toString("hex");
        // =====================================
        // CREATE SELLER
        // =====================================
        const user =
            await User.create({
                name,
                email,
                phone:
                    normalizedPhone,
                password:
                    generatedPassword,
                profileImage,
                role:
                    "seller",
                isVerified:
                    true,
                isActive:
                    true,
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
        // GENERATE SELLER JWT
        // =====================================
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role:
                    "seller",
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
    // SELLER FIREBASE SOCIAL LOGIN
    // Google + Facebook
    // =========================================
    static async sellerFirebaseLogin(
        firebaseIdToken: string
    ) {
        if (!firebaseIdToken) {
            throw new Error(
                "Firebase ID token is required"
            );
        }
        // =====================================
        // VERIFY FIREBASE ID TOKEN
        // =====================================
        const decodedToken =
            await firebaseAdminAuth.verifyIdToken(
                firebaseIdToken
            );
        // =====================================
        // IDENTIFY PROVIDER
        // =====================================
        const provider =
            decodedToken.firebase
                ?.sign_in_provider;
        console.log(
            "🔥 Seller Firebase provider:",
            provider
        );
        // Seller social login is allowed only
        // through Google or Facebook.
        if (
            provider !== "google.com" &&
            provider !== "facebook.com"
        ) {
            throw new Error(
                "Please use Google or Facebook to sign in as a seller."
            );
        }
        // =====================================
        // GET VERIFIED EMAIL
        // =====================================
        const email =
            decodedToken.email
                ?.toLowerCase()
                .trim();
        if (!email) {
            throw new Error(
                "Firebase account email was not provided"
            );
        }
        // =====================================
        // FIND SELLER ACCOUNT
        // =====================================
        const user =
            await User.findOne({
                email,
            });
        // =====================================
        // SELLER ROLE CHECK
        // =====================================
        if (
            !user ||
            user.role !== "seller"
        ) {
            throw new Error(
                "No seller account exists for this Google/Facebook email. Please register as a seller first."
            );
        }
        // =====================================
        // ACTIVE CHECK
        // =====================================
        if (!user.isActive) {
            throw new Error(
                "This seller account is inactive"
            );
        }
        // =====================================
        // SELLER SESSION TOKEN
        // =====================================
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "seller",
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
    // SELLER GOOGLE LOGIN
    // =========================================
    static async sellerGoogleLogin(
        idToken: string
    ) {
        // =====================================
        // GOOGLE CONFIG CHECK
        // =====================================
        if (
            !env.GOOGLE_WEB_CLIENT_ID
        ) {
            throw new Error(
                "Google login is not configured on the server"
            );
        }
        // =====================================
        // VERIFY GOOGLE TOKEN
        // =====================================
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
        // FIND SELLER
        // =====================================
        const user =
            await User.findOne({
                email,
            });
        // =====================================
        // SELLER ROLE CHECK
        // =====================================
        if (
            !user ||
            user.role !== "seller"
        ) {
            throw new Error(
                "No seller account exists for this Google email. Please register first."
            );
        }
        // =====================================
        // ACTIVE CHECK
        // =====================================
        if (!user.isActive) {
            throw new Error(
                "This seller account is inactive"
            );
        }
        // =====================================
        // GENERATE SELLER SESSION TOKEN
        // =====================================
        //
        // IMPORTANT:
        //
        // Seller app gets:
        //
        // role = "seller"
        //
        // MongoDB:
        //
        // role = "seller"
        //
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "seller",
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
        // =====================================
        // GOOGLE CONFIG CHECK
        // =====================================
        if (
            !env.GOOGLE_WEB_CLIENT_ID
        ) {
            throw new Error(
                "Google login is not configured on the server"
            );
        }
        // =====================================
        // VERIFY GOOGLE TOKEN
        // =====================================
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
        // FIND ACCOUNT
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
        // ACTIVE CHECK
        // =====================================
        if (!user.isActive) {
            throw new Error(
                "This account is inactive"
            );
        }
        // =====================================
        // CUSTOMER SESSION
        // =====================================
        //
        // IMPORTANT:
        //
        // We intentionally DO NOT require:
        //
        // user.role === "customer"
        //
        // here.
        //
        // This allows an existing seller account
        // to enter the Customer app.
        //
        // Example:
        //
        // MongoDB:
        // user.role = "seller"
        //
        // Customer session:
        // JWT role = "customer"
        //
        // The MongoDB role is NOT changed.
        //
        if (
            user.role !== "customer" &&
            user.role !== "seller"
        ) {
            throw new Error(
                "This account cannot be used in the customer application"
            );
        }
        // =====================================
        // GENERATE CUSTOMER SESSION TOKEN
        // =====================================
        //
        // VERY IMPORTANT:
        //
        // Do NOT use:
        //
        // role: user.role
        //
        // because a seller would then receive:
        //
        // role = seller
        //
        // Instead, the Customer app always receives:
        //
        // role = customer
        //
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
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
    // CUSTOMER GOOGLE REGISTER
    // =========================================
    static async googleRegister(
        idToken: string,
        phone: string
    ) {
        // =====================================
        // GOOGLE CONFIG CHECK
        // =====================================
        if (!env.GOOGLE_WEB_CLIENT_ID) {
            throw new Error(
                "Google registration is not configured on the server"
            );
        }
        // =====================================
        // BASIC VALIDATION
        // =====================================
        const normalizedPhone =
            phone?.trim();
        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }
        // =====================================
        // VERIFY GOOGLE TOKEN
        // =====================================
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
        // CHECK EXISTING EMAIL
        // =====================================
        const existingEmailUser =
            await User.findOne({
                email,
            });
        if (existingEmailUser) {
            if (
                existingEmailUser.role === "seller"
            ) {
                throw new Error(
                    "This Google email belongs to a seller account. Please use Login with Google."
                );
            }
            if (
                existingEmailUser.role === "customer"
            ) {
                throw new Error(
                    "A customer account already exists with this Google email. Please use Login with Google."
                );
            }
            throw new Error(
                "An account already exists with this Google email"
            );
        }
        // =====================================
        // CHECK EXISTING PHONE
        // =====================================
        const existingPhoneUser =
            await User.findOne({
                phone: normalizedPhone,
            });
        if (existingPhoneUser) {
            throw new Error(
                "This phone number is already registered"
            );
        }
        // =====================================
        // GOOGLE USER NAME
        // =====================================
        const name =
            payload.name?.trim() ||
            payload.given_name?.trim() ||
            email.split("@")[0];
        // =====================================
        // GOOGLE PROFILE IMAGE
        // =====================================
        const profileImage =
            payload.picture || "";
        // =====================================
        // GENERATE INTERNAL PASSWORD
        // =====================================
        //
        // Google users authenticate through
        // Google, so the password is not given
        // by the user.
        //
        // We still provide a random password
        // because the current User schema requires
        // the password field.
        //
        // UserSchema.pre("save") will hash it.
        //
        const generatedPassword =
            crypto.randomBytes(32)
                .toString("hex");
        // =====================================
        // CREATE CUSTOMER ACCOUNT
        // =====================================
        const user =
            await User.create({
                name,
                email,
                phone:
                    normalizedPhone,
                password:
                    generatedPassword,
                profileImage,
                role: "customer",
                isVerified: true,
                isActive: true,
            });
        // =====================================
        // GENERATE CUSTOMER SESSION TOKEN
        // =====================================
        //
        // This is a CUSTOMER session.
        //
        // MongoDB:
        // role = customer
        //
        // JWT:
        // role = customer
        //
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
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
    // FACEBOOK TOKEN VERIFICATION
    // =========================================
    private static async verifyFacebookToken(
        accessToken: string
    ) {
        const appId =
            process.env.FACEBOOK_APP_ID;
        const appSecret =
            process.env.FACEBOOK_APP_SECRET;
        if (!appId || !appSecret) {
            throw new Error(
                "Facebook authentication is not configured"
            );
        }
        if (!accessToken) {
            throw new Error(
                "Facebook access token is required"
            );
        }
        const appAccessToken =
            `${appId}|${appSecret}`;
        const graphVersion =
            process.env.FACEBOOK_GRAPH_VERSION ||
            "v26.0";
        // Verify that the access token is valid
        // and belongs to this Facebook app.
        const debugResponse =
            await fetch(
                `https://graph.facebook.com/${graphVersion}/debug_token` +
                `?input_token=${encodeURIComponent(
                    accessToken
                )}` +
                `&access_token=${encodeURIComponent(
                    appAccessToken
                )}`
            );
        const debugData =
            await debugResponse.json();
        if (
            !debugResponse.ok ||
            !debugData?.data?.is_valid
        ) {
            throw new Error(
                "Invalid Facebook access token"
            );
        }
        if (
            String(
                debugData.data.app_id
            ) !== String(appId)
        ) {
            throw new Error(
                "Facebook token does not belong to this app"
            );
        }
        // Fetch the Facebook profile after
        // the token has been verified.
        const profileResponse =
            await fetch(
                `https://graph.facebook.com/${graphVersion}/me` +
                `?fields=id,name,email,picture.type(large)` +
                `&access_token=${encodeURIComponent(
                    accessToken
                )}`
            );
        const profile =
            await profileResponse.json();
        if (
            !profileResponse.ok ||
            !profile?.id
        ) {
            throw new Error(
                "Unable to fetch Facebook profile"
            );
        }
        return {
            providerId: String(profile.id),
            name:
                profile.name?.trim() ||
                "Facebook User",
            email:
                profile.email
                    ?.toLowerCase()
                    .trim() ||
                "",
            profileImage:
                profile.picture?.data?.url ||
                "",
        };
    }
    // =========================================
    // CUSTOMER FACEBOOK LOGIN
    // =========================================
    static async facebookLogin(
        accessToken: string
    ) {
        const facebook =
            await this.verifyFacebookToken(
                accessToken
            );
        let user =
            await User.findOne({
                facebookId:
                    facebook.providerId,
            });
        // Link Facebook to an existing account
        // when the verified Facebook email matches.
        if (!user && facebook.email) {
            user =
                await User.findOne({
                    email:
                        facebook.email,
                });
            if (user) {
                user.facebookId =
                    facebook.providerId;
                if (
                    !user.profileImage &&
                    facebook.profileImage
                ) {
                    user.profileImage =
                        facebook.profileImage;
                }
                await user.save();
            }
        }
        if (!user) {
            throw new Error(
                "No account exists for this Facebook account. Please register first."
            );
        }
        if (!user.isActive) {
            throw new Error(
                "This account is inactive"
            );
        }
        // Customer App session.
        // MongoDB role is NOT changed.
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
            });
        return {
            user,
            token,
        };
    }
    // =========================================
    // CUSTOMER FACEBOOK REGISTER
    // =========================================
    static async facebookRegister(
        accessToken: string,
        phone: string,
        nameFromForm?: string,
        emailFromForm?: string
    ) {
        const facebook =
            await this.verifyFacebookToken(
                accessToken
            );
        const normalizedPhone =
            phone?.trim();
        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }
        const email =
            facebook.email ||
            emailFromForm
                ?.trim()
                .toLowerCase();
        if (!email) {
            throw new Error(
                "Email address is required for Facebook registration"
            );
        }
        const existingFacebookUser =
            await User.findOne({
                facebookId:
                    facebook.providerId,
            });
        if (existingFacebookUser) {
            throw new Error(
                "A Facebook account is already registered. Please use Login with Facebook."
            );
        }
        const existingEmailUser =
            await User.findOne({
                email,
            });
        if (existingEmailUser) {
            throw new Error(
                "An account already exists with this email. Please use Login with Facebook or your existing login method."
            );
        }
        const existingPhoneUser =
            await User.findOne({
                phone:
                    normalizedPhone,
            });
        if (existingPhoneUser) {
            throw new Error(
                "This phone number is already registered"
            );
        }
        const generatedPassword =
            crypto
                .randomBytes(32)
                .toString("hex");
        const user =
            await User.create({
                name:
                    nameFromForm?.trim() ||
                    facebook.name,
                email,
                phone:
                    normalizedPhone,
                password:
                    generatedPassword,
                profileImage:
                    facebook.profileImage,
                facebookId:
                    facebook.providerId,
                role: "customer",
                isVerified: true,
                isActive: true,
            });
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
            });
        return {
            user,
            token,
        };
    }
    // =========================================
    // APPLE TOKEN VERIFICATION
    // =========================================
    private static appleJWKS =
        createRemoteJWKSet(
            new URL(
                "https://appleid.apple.com/auth/keys"
            )
        );
    private static async verifyAppleToken(
        identityToken: string
    ) {
        const clientId =
            process.env.APPLE_CLIENT_ID;
        if (!clientId) {
            throw new Error(
                "Apple authentication is not configured"
            );
        }
        if (!identityToken) {
            throw new Error(
                "Apple identity token is required"
            );
        }
        const { payload } =
            await jwtVerify(
                identityToken,
                this.appleJWKS,
                {
                    issuer:
                        "https://appleid.apple.com",
                    audience:
                        clientId,
                }
            );
        const appleId =
            payload.sub;
        const email =
            typeof payload.email ===
                "string"
                ? payload.email
                    .toLowerCase()
                    .trim()
                : "";
        if (!appleId) {
            throw new Error(
                "Apple user ID was not returned"
            );
        }
        return {
            providerId:
                String(appleId),
            email,
            emailVerified:
                payload.email_verified ===
                true ||
                payload.email_verified ===
                "true",
        };
    }
    // =========================================
    // CUSTOMER APPLE LOGIN
    // =========================================
    static async appleLogin(
        identityToken: string
    ) {
        const apple =
            await this.verifyAppleToken(
                identityToken
            );
        let user =
            await User.findOne({
                appleId:
                    apple.providerId,
            });
        // Link Apple to an existing account
        // when the verified Apple email matches.
        if (!user && apple.email) {
            user =
                await User.findOne({
                    email:
                        apple.email,
                });
            if (user) {
                user.appleId =
                    apple.providerId;
                await user.save();
            }
        }
        if (!user) {
            throw new Error(
                "No account exists for this Apple account. Please register first."
            );
        }
        if (!user.isActive) {
            throw new Error(
                "This account is inactive"
            );
        }
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
            });
        return {
            user,
            token,
        };
    }
    // =========================================
    // CUSTOMER APPLE REGISTER
    // =========================================
    static async appleRegister(
        identityToken: string,
        phone: string,
        nameFromForm?: string,
        emailFromForm?: string
    ) {
        const apple =
            await this.verifyAppleToken(
                identityToken
            );
        const normalizedPhone =
            phone?.trim();
        if (!normalizedPhone) {
            throw new Error(
                "Phone number is required"
            );
        }
        const email =
            apple.email ||
            emailFromForm
                ?.trim()
                .toLowerCase();
        if (!email) {
            throw new Error(
                "Email address is required for Apple registration"
            );
        }
        const existingAppleUser =
            await User.findOne({
                appleId:
                    apple.providerId,
            });
        if (existingAppleUser) {
            throw new Error(
                "An Apple account is already registered. Please use Login with Apple."
            );
        }
        const existingEmailUser =
            await User.findOne({
                email,
            });
        if (existingEmailUser) {
            throw new Error(
                "An account already exists with this email. Please use Login with Apple or your existing login method."
            );
        }
        const existingPhoneUser =
            await User.findOne({
                phone:
                    normalizedPhone,
            });
        if (existingPhoneUser) {
            throw new Error(
                "This phone number is already registered"
            );
        }
        const generatedPassword =
            crypto
                .randomBytes(32)
                .toString("hex");
        const user =
            await User.create({
                name:
                    nameFromForm?.trim() ||
                    "Apple User",
                email,
                phone:
                    normalizedPhone,
                password:
                    generatedPassword,
                profileImage: "",
                appleId:
                    apple.providerId,
                role: "customer",
                isVerified:
                    apple.emailVerified,
                isActive: true,
            });
        const token =
            generateAccessToken({
                userId:
                    user._id.toString(),
                role: "customer",
            });
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
        otp: string
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
        newPassword: string
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
        phone: string
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
        otp: string
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