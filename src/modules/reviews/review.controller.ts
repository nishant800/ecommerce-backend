import { Response } from 'express';

import {
    AuthRequest,
} from '../../middleware/auth.middleware.js';

import {
    ReviewService,
} from './review.service.js';

export class ReviewController {

    // =========================================
    // CREATE REVIEW
    // =========================================

    static async create(
        req: AuthRequest,
        res: Response,
    ) {
        try {
            const userId =
                req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }

            const review =
                await ReviewService.create(
                    userId,
                    {
                        orderId:
                            String(
                                req.body.orderId ||
                                '',
                            ),

                        productId:
                            String(
                                req.body.productId ||
                                '',
                            ),

                        rating:
                            Number(
                                req.body.rating,
                            ),

                        comment:
                            typeof req.body.comment ===
                                'string'
                                ? req.body.comment
                                : '',
                    },
                );

            return res.status(201).json({
                success: true,
                data: review,
            });

        } catch (error: any) {

            const message =
                error?.message ||
                'Unable to submit review';

            const status =
                message.includes('already')
                    ? 409
                    : message.includes(
                        'Only delivered',
                    )
                        ? 403
                        : 400;

            return res.status(status).json({
                success: false,
                message,
            });
        }
    }


    // =========================================
    // GET PRODUCT REVIEWS
    // PUBLIC
    // =========================================

    static async getProductReviews(
        req: AuthRequest,
        res: Response,
    ) {
        try {
            const data =
                await ReviewService.getProductReviews(
                    String(
                        req.params.productId,
                    ),
                );

            return res.json({
                success: true,
                data,
            });

        } catch (error: any) {

            const message =
                error?.message ||
                'Unable to load product reviews';

            const status =
                message ===
                    'Product not found'
                    ? 404
                    : 400;

            return res.status(status).json({
                success: false,
                message,
            });
        }
    }


    // =========================================
    // GET ORDER REVIEW STATE
    // =========================================

    static async getOrderState(
        req: AuthRequest,
        res: Response,
    ) {
        try {
            const userId =
                req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }

            const data =
                await ReviewService.getOrderReviewState(
                    userId,
                    String(
                        req.params.orderId,
                    ),
                );

            return res.json({
                success: true,
                data,
            });

        } catch (error: any) {

            return res.status(404).json({
                success: false,
                message:
                    error?.message ||
                    'Unable to load review state',
            });
        }
    }
}