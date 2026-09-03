import { Router } from "express";
import { AddressController } from "./address.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

// Protect all address routes
router.use(authenticate);

// Create Address
router.post("/", AddressController.create);

// Get All Addresses
router.get("/", AddressController.getAll);

// Update Address
router.put("/:id", AddressController.update);

// Delete Address
router.delete("/:id", AddressController.delete);

// Set Default Address
router.patch("/default/:id", AddressController.setDefault);

export default router;