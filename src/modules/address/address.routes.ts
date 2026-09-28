import { Router } from "express";
import {
    AddressController,
} from "./address.controller.js";
import {
    authenticate,
} from "../../middleware/auth.middleware.js";
const router = Router();
// =========================================
// PROTECT ALL ADDRESS ROUTES
// =========================================
router.use(authenticate);
// =========================================
// CREATE ADDRESS
// POST /api/address
// =========================================
router.post(
    "/",
    AddressController.create
);
// =========================================
// GET ALL ADDRESSES
// GET /api/address
// =========================================
router.get(
    "/",
    AddressController.getAll
);
// =========================================
// SET DEFAULT ADDRESS
// PATCH /api/address/default/:id
// =========================================
router.patch(
    "/default/:id",
    AddressController.setDefault
);
// =========================================
// GET SINGLE ADDRESS
// GET /api/address/:id
// =========================================
router.get(
    "/:id",
    AddressController.getById
);
// =========================================
// UPDATE ADDRESS
// PUT /api/address/:id
// =========================================
router.put(
    "/:id",
    AddressController.update
);
// =========================================
// DELETE ADDRESS
// DELETE /api/address/:id
// =========================================
router.delete(
    "/:id",
    AddressController.delete
);
export default router;