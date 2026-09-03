import mongoose from "mongoose";

import Notification, {
    NotificationType,
    NotificationRecipientRole,
} from "./notification.model.js";


// =========================================
// GET RECIPIENT ROLE FROM NOTIFICATION TYPE
// =========================================

const getRecipientRole =
    (
        type: NotificationType,
    ): NotificationRecipientRole => {

        switch (type) {

            // =====================================
            // SELLER NOTIFICATIONS
            // =====================================

            case NotificationType.NEW_ORDER:

            case NotificationType.REPLACEMENT_REQUESTED:

                return NotificationRecipientRole.SELLER;


            // =====================================
            // CUSTOMER NOTIFICATIONS
            // =====================================

            case NotificationType.ORDER_PLACED:

            case NotificationType.ORDER_SHIPPED:

            case NotificationType.ORDER_DELIVERED:

            case NotificationType.ORDER_CANCELLED:

            case NotificationType.REPLACEMENT_APPROVED:

            case NotificationType.REPLACEMENT_REJECTED:

            case NotificationType.REPLACEMENT_COMPLETED:

                return NotificationRecipientRole.CUSTOMER;


            // =====================================
            // GENERAL
            // =====================================

            case NotificationType.GENERAL:

                throw new Error(
                    "Notification recipient role is required for general notifications.",
                );


            default:

                throw new Error(
                    "Unable to determine notification recipient role.",
                );
        }
    };


// =========================================
// NOTIFICATION SERVICE
// =========================================

export class NotificationService {


    // =========================================
    // CREATE NOTIFICATION
    // =========================================

    static async create(
        data: {

            userId:
            string |
            mongoose.Types.ObjectId;

            type:
            NotificationType;

            title:
            string;

            message:
            string;

            orderId?:
            string |
            mongoose.Types.ObjectId;

            replacementId?:
            string |
            mongoose.Types.ObjectId;

            recipientRole?:
            NotificationRecipientRole;
        },
    ) {

        const recipientRole =
            data.recipientRole ||
            getRecipientRole(
                data.type,
            );


        return Notification.create({

            user:
                data.userId,

            recipientRole:

                recipientRole,

            type:

                data.type,

            title:

                data.title.trim(),

            message:

                data.message.trim(),

            order:

                data.orderId,

            replacement:

                data.replacementId,

            isRead:

                false,
        });
    }


    // =========================================
    // GET USER NOTIFICATIONS
    // =========================================

    static async getUserNotifications(
        userId: string,
        recipientRole:
            NotificationRecipientRole,
    ) {

        return Notification.find({

            user:
                userId,

            recipientRole:
                recipientRole,

        })
            .sort({

                createdAt:
                    -1,

            })
            .limit(100);
    }


    // =========================================
    // GET UNREAD COUNT
    // =========================================

    static async getUnreadCount(
        userId: string,
        recipientRole:
            NotificationRecipientRole,
    ) {

        return Notification.countDocuments({

            user:
                userId,

            recipientRole:
                recipientRole,

            isRead:
                false,
        });
    }


    // =========================================
    // MARK ONE AS READ
    // =========================================

    static async markAsRead(
        userId: string,
        notificationId: string,
        recipientRole:
            NotificationRecipientRole,
    ) {

        if (
            !mongoose.Types.ObjectId.isValid(
                notificationId,
            )
        ) {

            throw new Error(
                "Invalid notification ID.",
            );
        }


        return Notification.findOneAndUpdate(

            {

                _id:
                    notificationId,

                user:
                    userId,

                recipientRole:
                    recipientRole,

            },

            {

                $set: {

                    isRead:
                        true,

                },

            },

            {

                new:
                    true,

            },
        );
    }


    // =========================================
    // MARK ALL AS READ
    // =========================================

    static async markAllAsRead(
        userId: string,
        recipientRole:
            NotificationRecipientRole,
    ) {

        return Notification.updateMany(

            {

                user:
                    userId,

                recipientRole:
                    recipientRole,

                isRead:
                    false,

            },

            {

                $set: {

                    isRead:
                        true,

                },

            },
        );
    }
}