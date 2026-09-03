import { Router } from "express";
import { CartController } from "./cart.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", CartController.getCart);
router.post("/", CartController.addToCart);
router.put("/", CartController.updateQuantity);
router.delete("/:productId", CartController.removeItem);
router.delete("/", CartController.clearCart);

export default router;