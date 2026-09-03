import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticate } from "./middleware/auth.middleware.js";

const router = Router();

router.post(
    "/register",
    AuthController.register
);
router.post(
    "/seller-register",
    AuthController.sellerRegister
);
router.post(
    "/login",
    AuthController.login
);
router.post(
    "/google-login",
    AuthController.googleLogin,
);
router.post(
    "/seller/google-login",
    AuthController.sellerGoogleLogin,
);

router.post(
    "/forgot-password",
    AuthController.forgotPassword
);

router.post(
    "/verify-otp",
    AuthController.verifyResetOTP
);

router.post(
    "/reset-password",
    AuthController.resetPassword
);

router.get(
    "/me",
    authenticate,
    AuthController.me
);
router.post(
    "/forgot-email",
    AuthController.forgotEmail,
);

router.post(
    "/verify-forgot-email-otp",
    AuthController.verifyForgotEmailOTP,
);
export default router;
