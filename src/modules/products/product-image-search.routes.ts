import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../../middleware/auth.middleware.js';

import {
    ProductImageSearchController,
} from './product-image-search.controller.js';

const router = Router();

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize:
            Number(
                process.env.IMAGE_SEARCH_MAX_FILE_SIZE ||
                8 * 1024 * 1024,
            ),
    },
    fileFilter: (_req, file, callback) => {
        callback(
            null,
            String(file.mimetype || '').startsWith(
                'image/',
            ),
        );
    },
});

router.post(
    '/',
    authenticate,
    imageUpload.single('image'),
    ProductImageSearchController.search,
);

export default router;
