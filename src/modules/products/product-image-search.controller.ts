import type { Request, Response } from 'express';

import {
    ProductImageSearchService,
} from './product-image-search.service.js';

export class ProductImageSearchController {
    static async search(
        req: Request,
        res: Response,
    ) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Product image is required.',
                });
            }

            const matches =
                await ProductImageSearchService.search(
                    req.file.buffer,
                    req.file.mimetype,
                );

            return res.json({
                success: true,
                products: matches.map(
                    match => match.product,
                ),
                matches: matches.map(
                    match => ({
                        productId:
                            match.product?._id,
                        score:
                            match.score,
                        matchedImage:
                            match.matchedImage,
                    }),
                ),
            });
        } catch (error: any) {
            console.error(
                'PRODUCT IMAGE SEARCH ERROR:',
                error,
            );

            return res.status(500).json({
                success: false,
                message:
                    error?.message ||
                    'Unable to search products by image.',
            });
        }
    }
}
