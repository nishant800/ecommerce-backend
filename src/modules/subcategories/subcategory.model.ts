import mongoose, {
    Document,
    Schema,
    Model,
} from "mongoose";

import Category from "../categories/category.model.js";

export interface ISubcategory
    extends Document {
    name: string;
    slug: string;
    image: string;
    description: string;
    category: mongoose.Types.ObjectId;
    isActive: boolean;
}

const SubcategorySchema =
    new Schema<ISubcategory>(
        {
            name: {
                type: String,
                required: true,
                trim: true,
            },

            slug: {
                type: String,
                required: true,
                lowercase: true,
                trim: true,
            },

            image: {
                type: String,
                default: "",
            },

            description: {
                type: String,
                default: "",
            },

            category: {
                type: Schema.Types.ObjectId,
                ref: "Category",
                required: true,
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

// A subcategory name only needs to be unique
// inside its parent category.
SubcategorySchema.index(
    {
        category: 1,
        slug: 1,
    },
    {
        unique: true,
    }
);

SubcategorySchema.pre(
    "validate",
    async function (next) {
        if (!this.category) {
            return next();
        }

        const category =
            await Category.findById(
                this.category
            );

        if (!category) {
            return next(
                new Error(
                    "Category not found"
                )
            );
        }

        next();
    }
);

const Subcategory: Model<ISubcategory> =
    mongoose.model(
        "Subcategory",
        SubcategorySchema
    );

export default Subcategory;