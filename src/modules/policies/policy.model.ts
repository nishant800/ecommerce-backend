import mongoose, {
    Schema,
    Document,
    Model,
} from "mongoose";


// =========================================
// POLICY TYPES
// =========================================

export type PolicyType =
    | "terms"
    | "privacy"
    | "replacement"
    | "cancellation"
    | "shipping"
    | "refund";


// =========================================
// POLICY INTERFACE
// =========================================

export interface IPolicy
    extends Document {

    type: PolicyType;

    title: string;

    content: string;

    version: string;

    active: boolean;

    createdAt: Date;

    updatedAt: Date;
}


// =========================================
// POLICY SCHEMA
// =========================================

const PolicySchema =
    new Schema<IPolicy>(
        {

            type: {
                type: String,

                enum: [
                    "terms",
                    "privacy",
                    "replacement",
                    "cancellation",
                    "shipping",
                    "refund",
                ],

                required: true,

                unique: true,

                index: true,
            },


            title: {
                type: String,

                required: true,

                trim: true,
            },


            content: {
                type: String,

                required: true,

                default: "",
            },


            version: {
                type: String,

                required: true,

                default: "1.0",
            },


            active: {
                type: Boolean,

                default: true,

                index: true,
            },

        },

        {
            timestamps: true,
        },
    );


// =========================================
// MODEL
// =========================================

const Policy: Model<IPolicy> =
    mongoose.model<IPolicy>(
        "Policy",
        PolicySchema,
    );


export default Policy;