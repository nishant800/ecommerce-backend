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

    isVerified: boolean;
    isActive: boolean;

    resetPasswordOTP?: string;
    resetPasswordOTPExpires?: Date;

    forgotEmailOTP?: string;
    forgotEmailOTPExpires?: Date;

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
// USER SCHEMA
// =========================================

const UserSchema = new Schema<IUser>(
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