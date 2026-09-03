import { Router } from "express";

import { ProductController } from "./product.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { sellerOnly } from "../../middleware/seller.middleware.js";

const router = Router();


// =========================================
// SELLER PRODUCT ROUTES
// =========================================

// Get products belonging to logged-in seller
// IMPORTANT: /my must come BEFORE /:id
router.get(
    "/my",
    authenticate,
    sellerOnly,
    ProductController.getMyProducts
);


// Create product
router.post(
    "/",
    authenticate,
    sellerOnly,
    ProductController.create
);


// Update product
router.put(
    "/:id",
    authenticate,
    sellerOnly,
    ProductController.update
);


// Delete product
router.delete(
    "/:id",
    authenticate,
    sellerOnly,
    ProductController.delete
);


// =========================================
// PUBLIC PRODUCT ROUTES
// =========================================

// Get all products
router.get(
    "/",
    ProductController.getAll
);


// Get product by ID
router.get(
    "/:id",
    ProductController.getById
);

export default router;