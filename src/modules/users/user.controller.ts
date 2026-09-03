import { Response } from "express";
import User from "./user.model.js";
import { AuthRequest } from "../auth/middleware/auth.middleware.js";

export class UserController {
    static async updateProfile(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const {
                name,
                phone,
                profileImage,
            } = req.body;

            const updateData: {
                name?: string;
                phone?: string;
                profileImage?: string;
            } = {};

            if (name !== undefined) {
                if (!name.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Name cannot be empty",
                    });
                }

                updateData.name = name.trim();
            }

            if (phone !== undefined) {
                if (!phone.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Phone cannot be empty",
                    });
                }

                updateData.phone = phone.trim();
            }

            if (profileImage !== undefined) {
                updateData.profileImage =
                    profileImage;
            }

            const user =
                await User.findByIdAndUpdate(
                    userId,
                    {
                        $set: updateData,
                    },
                    {
                        new: true,
                        runValidators: true,
                    }
                ).select(
                    "name email phone profileImage role isVerified isActive"
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Profile updated successfully",
                user,
            });
        } catch (error: any) {
            console.error(
                "Update Profile Error:",
                error
            );

            if (
                error?.code === 11000
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Phone number is already registered",
                });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update profile",
            });
        }
    }
    static async changePassword(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const {
                currentPassword,
                newPassword,
            } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Current password and new password are required",
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message:
                        "New password must be at least 6 characters",
                });
            }

            const user =
                await User.findById(userId)
                    .select("+password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            const isMatch =
                await user.comparePassword(
                    currentPassword
                );

            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Current password is incorrect",
                });
            }

            if (
                currentPassword ===
                newPassword
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "New password must be different from current password",
                });
            }

            user.password = newPassword;

            await user.save();

            return res.status(200).json({
                success: true,
                message:
                    "Password changed successfully",
            });
        } catch (error) {
            console.error(
                "Change Password Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to change password",
            });
        }
    }
    // =========================================
    // DELETE ACCOUNT
    // =========================================

    static async deleteAccount(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const userId =
                req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }


            const user =
                await User.findById(
                    userId
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }


            if (!user.isActive) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Account is already inactive",
                });
            }


            // =====================================
            // KEEP ORDER HISTORY BUT REMOVE
            // PERSONAL ACCOUNT INFORMATION
            // =====================================

            const deletedEmail =
                `deleted_${String(user._id)}@deleted.local`;

            const deletedPhone =
                `deleted_${String(user._id)}`;

            user.name =
                "Deleted User";

            user.email =
                deletedEmail;

            user.phone =
                deletedPhone;

            user.profileImage =
                "";

            user.isActive =
                false;

            user.resetPasswordOTP =
                undefined;

            user.resetPasswordOTPExpires =
                undefined;

            user.forgotEmailOTP =
                undefined;

            user.forgotEmailOTPExpires =
                undefined;


            // Remove seller business information
            // if it exists on this account.
            user.business =
                undefined;


            await user.save();


            return res.status(200).json({

                success: true,

                message:
                    "Your account has been deleted successfully.",

            });

        } catch (error: any) {

            console.error(
                "DELETE ACCOUNT ERROR:",
                error,
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete account.",

            });
        }
    }
}