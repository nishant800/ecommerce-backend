import mongoose, {
    Document,
    Model,
    Schema,
} from 'mongoose';

export interface IReview extends Document {
    user: mongoose.Types.ObjectId;
    order: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        order: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
        },

        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },

        comment: {
            type: String,
            default: '',
            trim: true,
            maxlength: 1000,
        },
    },
    {
        timestamps: true,
    },
);

ReviewSchema.index(
    {
        user: 1,
        order: 1,
        product: 1,
    },
    {
        unique: true,
    },
);

ReviewSchema.index({
    product: 1,
});

const Review: Model<IReview> =
    mongoose.models.Review ||
    mongoose.model<IReview>(
        'Review',
        ReviewSchema,
    );

export default Review;