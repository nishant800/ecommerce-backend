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
// =========================================
// GOOGLE
// =========================================
router.post(
    "/google-login",
    AuthController.googleLogin
);
// CUSTOMER GOOGLE REGISTER
router.post(
    "/google-register",
    AuthController.googleRegister
);
// =========================================
// FIREBASE SOCIAL LOGIN
// =========================================
router.post(
    "/firebase-login",
    AuthController.firebaseLogin
);
// CUSTOMER FIREBASE REGISTER
router.post(
    "/firebase-register",
    AuthController.firebaseRegister
);
// =========================================
// FACEBOOK
// =========================================
// CUSTOMER FACEBOOK LOGIN
router.post(
    "/facebook-login",
    AuthController.facebookLogin
);
// CUSTOMER FACEBOOK REGISTER
router.post(
    "/facebook-register",
    AuthController.facebookRegister
);
// =========================================
// APPLE
// =========================================
// CUSTOMER APPLE LOGIN
router.post(
    "/apple-login",
    AuthController.appleLogin
);
// CUSTOMER APPLE REGISTER
router.post(
    "/apple-register",
    AuthController.appleRegister
);
// =========================================
// SELLER GOOGLE LOGIN
// =========================================
router.post(
    "/seller/google-login",
    AuthController.sellerGoogleLogin
);
router.post(
    "/seller/firebase-login",
    AuthController.sellerFirebaseLogin
);
// =========================================
// SELLER SOCIAL REGISTRATION
// GOOGLE / FACEBOOK THROUGH FIREBASE
// =========================================
router.post(
    "/seller/firebase-register",
    AuthController.sellerFirebaseRegister
);
// =========================================
// PASSWORD / EMAIL RECOVERY
// =========================================
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
// =========================================
// CURRENT USER
// =========================================
router.get(
    "/me",
    authenticate,
    AuthController.me
);
router.post(
    "/forgot-email",
    AuthController.forgotEmail
);
router.post(
    "/verify-forgot-email-otp",
    AuthController.verifyForgotEmailOTP
);
export default router;
