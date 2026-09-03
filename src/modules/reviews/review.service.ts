import mongoose from 'mongoose';

import Order, {
    OrderStatus,
} from '../orders/order.model.js';

import Product from '../products/product.model.js';

import Review from './review.model.js';

export class ReviewService {

    // =========================================
    // CREATE REVIEW
    // =========================================

    static async create(
        userId: string,
        data: {
            orderId: string;
            productId: string;
            rating: number;
            comment?: string;
        },
    ) {
        if (
            !mongoose.isValidObjectId(
                data.orderId,
            ) ||
            !mongoose.isValidObjectId(
                data.productId,
            )
        ) {
            throw new Error(
                'Invalid order or product ID',
            );
        }

        if (
            !Number.isInteger(data.rating) ||
            data.rating < 1 ||
            data.rating > 5
        ) {
            throw new Error(
                'Rating must be between 1 and 5',
            );
        }

        const comment =
            typeof data.comment === 'string'
                ? data.comment.trim()
                : '';

        if (comment.length > 1000) {
            throw new Error(
                'Review text must not exceed 1000 characters',
            );
        }

        const order =
            await Order.findOne({
                _id: data.orderId,
                user: userId,
                orderStatus:
                    OrderStatus.DELIVERED,
                'items.product':
                    data.productId,
            });

        if (!order) {
            throw new Error(
                'Only delivered purchased products can be reviewed',
            );
        }

        const existing =
            await Review.findOne({
                user: userId,
                order: data.orderId,
                product: data.productId,
            });

        if (existing) {
            throw new Error(
                'This purchased product has already been reviewed',
            );
        }

        let review;

        try {
            review =
                await Review.create({
                    user: userId,
                    order: data.orderId,
                    product: data.productId,
                    rating: data.rating,
                    comment,
                });
        } catch (error: any) {
            if (
                error?.code === 11000
            ) {
                throw new Error(
                    'This purchased product has already been reviewed',
                );
            }

            throw error;
        }

        const aggregate =
            await Review.aggregate([
                {
                    $match: {
                        product:
                            new mongoose.Types.ObjectId(
                                data.productId,
                            ),
                    },
                },
                {
                    $group: {
                        _id: '$product',
                        rating: {
                            $avg: '$rating',
                        },
                        reviewCount: {
                            $sum: 1,
                        },
                    },
                },
            ]);

        await Product.findByIdAndUpdate(
            data.productId,
            {
                $set: {
                    rating:
                        aggregate[0]?.rating ||
                        0,

                    reviewCount:
                        aggregate[0]
                            ?.reviewCount ||
                        0,
                },
            },
        );

        return review;
    }


    // =========================================
    // GET PRODUCT REVIEWS
    // PUBLIC
    // =========================================

    static async getProductReviews(
        productId: string,
    ) {
        if (
            !mongoose.isValidObjectId(
                productId,
            )
        ) {
            throw new Error(
                'Invalid product ID',
            );
        }

        const product =
            await Product.findById(
                productId,
            ).select('_id');

        if (!product) {
            throw new Error(
                'Product not found',
            );
        }

        const reviews =
            await Review.find({
                product: productId,
            })
                .populate(
                    'user',
                    'name fullName',
                )
                .sort({
                    createdAt: -1,
                })
                .limit(50);

        return reviews;
    }


    // =========================================
    // GET ORDER REVIEW STATE
    // =========================================

    static async getOrderReviewState(
        userId: string,
        orderId: string,
    ) {
        if (
            !mongoose.isValidObjectId(
                orderId,
            )
        ) {
            throw new Error(
                'Invalid order ID',
            );
        }

        const order =
            await Order.findOne({
                _id: orderId,
                user: userId,
            });

        if (!order) {
            throw new Error(
                'Order not found',
            );
        }

        const reviews =
            await Review.find({
                user: userId,
                order: orderId,
            });

        const byProduct =
            new Map(
                reviews.map(
                    review => [
                        String(
                            review.product,
                        ),
                        review,
                    ],
                ),
            );

        return order.items.map(
            item => {
                const review =
                    byProduct.get(
                        String(
                            item.product,
                        ),
                    );

                return {
                    productId:
                        String(
                            item.product,
                        ),

                    canReview:
                        order.orderStatus ===
                        OrderStatus.DELIVERED &&
                        !review,

                    alreadyReviewed:
                        Boolean(review),

                    rating:
                        review?.rating,

                    comment:
                        review?.comment,
                };
            },
        );
    }
}