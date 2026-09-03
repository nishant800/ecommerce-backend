import { Router } from "express";
import { UserController } from "./user.controller.js";
import { authenticate } from "../auth/middleware/auth.middleware.js";

const router = Router();

router.patch(
    "/profile",
    authenticate,
    UserController.updateProfile
);

router.patch(
    "/change-password",
    authenticate,
    UserController.changePassword
);
router.delete(

    "/account",

    authenticate,

    UserController.deleteAccount

);

export default router;