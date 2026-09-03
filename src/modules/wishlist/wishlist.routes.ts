import { Router } from "express";

import { WishlistController } from "./wishlist.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

// Protect all wishlist routes
router.use(authenticate);

// Get Wishlist
router.get("/", WishlistController.getWishlist);

// Add Product
router.post("/", WishlistController.addProduct);

// Toggle Product (Add if not exists, Remove if exists)
router.put("/toggle", WishlistController.toggleProduct);

// Remove Product
router.delete("/:productId", WishlistController.removeProduct);

export default router;