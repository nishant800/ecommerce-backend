import { Router } from "express";

import upload from "../middleware/upload.middleware.js";

import {
    uploadImages,
} from "../controllers/upload.controller.js";


const router = Router();


// =========================================
// UPLOAD HEALTH CHECK
// =========================================

router.get(
    "/",
    (_req, res) => {

        res.json({
            success: true,
            message:
                "Upload route working",
        });

    }
);


// =========================================
// IMAGE UPLOAD
// =========================================

router.post(
    "/",
    upload.any(),
    uploadImages
);


export default router;