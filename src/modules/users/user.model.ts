import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";
import bcrypt from "bcryptjs";
// =========================================
// USER ROLE
// =========================================
export enum UserRole {
    CUSTOMER = "customer",
    SELLER = "seller",
    ADMIN = "admin",
}
// =========================================
// SELLER BUSINESS DETAILS
// =========================================
export interface ISellerBusiness {
    pickupEnabled?: boolean;
    shopName: string;
    // Complete shop / return address
    address: string;
    area?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    // Shop contact number
    shopPhone?: string;
    // Optional business information
    businessType?: string;
    gstin?: string;
}
// =========================================
// FIREBASE CLOUD MESSAGING TOKEN
// =========================================
export interface IFcmToken {
    token: string;
    platform: "android" | "ios";
    updatedAt: Date;
}
// =========================================
// USER INTERFACE
// =========================================
export interface IUser extends Document {
    name: string;
    email: string;
    phone: string;
    password: string;
    profileImage: string;
    role: UserRole;
    // =====================================
    // SELLER BUSINESS PROFILE
    // =====================================
    business?: ISellerBusiness;
    // =====================================
    // SOCIAL LOGIN PROVIDERS
    // =====================================
    // Facebook account ID
    facebookId?: string;
    // Apple account ID
    appleId?: string;
    // =====================================
    // ACCOUNT STATUS
    // =====================================
    isVerified: boolean;
    isActive: boolean;
    fcmTokens?: IFcmToken[];
    // =====================================
    // PASSWORD RESET OTP
    // =====================================
    resetPasswordOTP?: string;
    resetPasswordOTPExpires?: Date;
    // =====================================
    // FORGOT EMAIL OTP
    // =====================================
    forgotEmailOTP?: string;
    forgotEmailOTPExpires?: Date;
    // =====================================
    // PASSWORD METHOD
    // =====================================
    comparePassword(
        password: string
    ): Promise<boolean>;
}
// =========================================
// SELLER BUSINESS SCHEMA
// =========================================
const SellerBusinessSchema =
    new Schema<ISellerBusiness>(
        {
            // =================================
            // SHOP NAME
            // =================================
            pickupEnabled: { type: Boolean, default: false },
            shopName: {
                type: String,
                trim: true,
                default: "",
            },
            // =================================
            // SHOP ADDRESS
            // =================================
            address: {
                type: String,
                trim: true,
                default: "",
            },
            area: {
                type: String,
                trim: true,
                default: "",
            },
            landmark: {
                type: String,
                trim: true,
                default: "",
            },
            // =================================
            // LOCATION
            // =================================
            city: {
                type: String,
                trim: true,
                default: "",
            },
            state: {
                type: String,
                trim: true,
                default: "",
            },
            pincode: {
                type: String,
                trim: true,
                default: "",
            },
            country: {
                type: String,
                trim: true,
                default: "India",
            },
            // =================================
            // SHOP PHONE
            // =================================
            shopPhone: {
                type: String,
                trim: true,
                default: "",
            },
            // =================================
            // BUSINESS INFORMATION
            // =================================
            businessType: {
                type: String,
                trim: true,
                default: "",
            },
            gstin: {
                type: String,
                trim: true,
                uppercase: true,
                default: "",
            },
        },
        {
            _id: false,
        }
    );
// =========================================
// FIREBASE CLOUD MESSAGING TOKEN SCHEMA
// =========================================
const FcmTokenSchema =
    new Schema<IFcmToken>(
        {
            token: {
                type: String,
                required: true,
                trim: true,
            },
            platform: {
                type: String,
                enum: [
                    "android",
                    "ios",
                ],
                required: true,
            },
            updatedAt: {
                type: Date,
                default: Date.now,
            },
        },
        {
            _id: false,
        },
    );
// =========================================
// USER SCHEMA
// =========================================
const UserSchema =
    new Schema<IUser>(
        {
            // =====================================
            // PERSONAL INFORMATION
            // =====================================
            name: {
                type: String,
                required: true,
                trim: true,
            },
            email: {
                type: String,
                required: true,
                unique: true,
                lowercase: true,
                trim: true,
            },
            phone: {
                type: String,
                required: true,
                unique: true,
                trim: true,
            },
            password: {
                type: String,
                required: true,
                minlength: 6,
                select: false,
            },
            // =====================================
            // PROFILE IMAGE
            // =====================================
            profileImage: {
                type: String,
                default: "",
            },
            // =====================================
            // USER ROLE
            // =====================================
            role: {
                type: String,
                enum: Object.values(UserRole),
                default: UserRole.CUSTOMER,
            },
            // =====================================
            // SELLER BUSINESS PROFILE
            // =====================================
            business: {
                type: SellerBusinessSchema,
                default: undefined,
            },
            // =====================================
            // FACEBOOK LOGIN
            // =====================================
            facebookId: {
                type: String,
                unique: true,
                sparse: true,
                trim: true,
            },
            // =====================================
            // APPLE LOGIN
            // =====================================
            appleId: {
                type: String,
                unique: true,
                sparse: true,
                trim: true,
            },
            // =====================================
            // ACCOUNT STATUS
            // =====================================
            isVerified: {
                type: Boolean,
                default: false,
            },
            isActive: {
                type: Boolean,
                default: true,
            },
            fcmTokens: {
                type: [FcmTokenSchema],
                default: [],
            },
            // =====================================
            // RESET PASSWORD OTP
            // =====================================
            resetPasswordOTP: {
                type: String,
                default: null,
                select: false,
            },
            resetPasswordOTPExpires: {
                type: Date,
                default: null,
                select: false,
            },
            // =====================================
            // FORGOT EMAIL OTP
            // =====================================
            forgotEmailOTP: {
                type: String,
                default: null,
                select: false,
            },
            forgotEmailOTPExpires: {
                type: Date,
                default: null,
                select: false,
            },
        },
        {
            timestamps: true,
        }
    );
// =========================================
// PASSWORD HASHING
// =========================================
UserSchema.pre(
    "save",
    async function (next) {
        if (!this.isModified("password")) {
            return next();
        }
        this.password =
            await bcrypt.hash(
                this.password,
                10
            );
        next();
    }
);
// =========================================
// COMPARE PASSWORD
// =========================================
UserSchema.methods.comparePassword =
    async function (
        password: string
    ) {
        return bcrypt.compare(
            password,
            this.password
        );
    };
// =========================================
// MODEL
// =========================================
const User: Model<IUser> =
    mongoose.models.User ||
    mongoose.model<IUser>(
        "User",
        UserSchema
    );
export default User;