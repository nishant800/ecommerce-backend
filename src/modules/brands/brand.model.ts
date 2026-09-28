import mongoose, {
    Schema,
    Document,
} from "mongoose";
export interface IBrand extends Document {
    name: string;
    slug: string;
    category: mongoose.Types.ObjectId;
    logo: string;
    description: string;
    isActive: boolean;
}
const BrandSchema = new Schema<IBrand>(
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
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
            index: true,
        },
        logo: {
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
// Brand name must be unique inside a category
BrandSchema.index(
    {
        category: 1,
        name: 1,
    },
    {
        unique: true,
        name: "brand_category_name_unique",
    }
);
// Brand slug must be unique inside a category
BrandSchema.index(
    {
        category: 1,
        slug: 1,
    },
    {
        unique: true,
        name: "brand_category_slug_unique",
    }
);
export default mongoose.model<IBrand>(
    "Brand",
    BrandSchema
);