import {
    Router,
} from "express";

import {
    SubcategoryController,
} from "./subcategory.controller.js";

const router = Router();

router.post(
    "/",
    SubcategoryController.create
);

router.get(
    "/",
    SubcategoryController.getAll
);

router.get(
    "/:id",
    SubcategoryController.getById
);

router.put(
    "/:id",
    SubcategoryController.update
);

router.delete(
    "/:id",
    SubcategoryController.delete
);

export default router;