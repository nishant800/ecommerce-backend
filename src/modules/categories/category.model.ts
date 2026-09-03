import mongoose, { Document, Schema, Model } from "mongoose";

export interface ICategory extends Document {
    name: string;
    slug: string;
    image: string;
    description: string;
    isActive: boolean;
}

const CategorySchema = new Schema<ICategory>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },

        image: {
            type: String,
            default: "",
        },

        description: {
            type: String,
            default: "",
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

const Category: Model<ICategory> = mongoose.model(
    "Category",
    CategorySchema
);

export default Category;