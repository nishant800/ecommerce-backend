import { Router } from 'express';

import {
    authenticate,
} from '../../middleware/auth.middleware.js';

import {
    ReviewController,
} from './review.controller.js';

const router = Router();


// =========================================
// PUBLIC PRODUCT REVIEWS
// =========================================

router.get(
    '/products/:productId',
    ReviewController.getProductReviews,
);


// =========================================
// AUTHENTICATED REVIEW ACTIONS
// =========================================

router.use(authenticate);

router.post(
    '/',
    ReviewController.create,
);

router.get(
    '/orders/:orderId',
    ReviewController.getOrderState,
);

export default router;