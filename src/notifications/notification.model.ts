import mongoose, {
    Document,
    Model,
    Schema,
} from "mongoose";
// =========================================
// NOTIFICATION TYPE
// =========================================
export enum NotificationType {
    ORDER_PLACED =
    "order_placed",
    ORDER_SHIPPED =
    "order_shipped",
    ORDER_DELIVERED =
    "order_delivered",
    ORDER_CANCELLED =
    "order_cancelled",
    REPLACEMENT_REQUESTED =
    "replacement_requested",
    REPLACEMENT_APPROVED =
    "replacement_approved",
    REPLACEMENT_REJECTED =
    "replacement_rejected",
    REPLACEMENT_COMPLETED =
    "replacement_completed",
    REFUND_PROCESSED = "refund_processed",
    REFUND_FAILED = "refund_failed",
    NEW_ORDER =
    "new_order",
    GENERAL =
    "general",
    PRODUCT_NEW = "product_new",
    OFFER = "offer",
}
// =========================================
// RECIPIENT ROLE
// =========================================
export enum NotificationRecipientRole {
    CUSTOMER =
    "customer",
    SELLER =
    "seller",
}
// =========================================
// NOTIFICATION INTERFACE
// =========================================
export interface INotification
    extends Document {
    dedupeKey?: string;
    pushSentAt?: Date;
    pushClaimUntil?: Date;
    pushData?: Record<string, string>;
    user:
    mongoose.Types.ObjectId;
    recipientRole:
    NotificationRecipientRole;
    type:
    NotificationType;
    title:
    string;
    message:
    string;
    order?:
    mongoose.Types.ObjectId;
    replacement?:
    mongoose.Types.ObjectId;
    isRead:
    boolean;
    createdAt:
    Date;
    updatedAt:
    Date;
}
// =========================================
// SCHEMA
// =========================================
const NotificationSchema =
    new Schema<INotification>(
        {
            dedupeKey: { type: String },
            pushSentAt: { type: Date, default: null },
            pushClaimUntil: { type: Date, default: null },
            pushData: { type: Map, of: String },
            user: {
                type:
                    Schema.Types.ObjectId,
                ref:
                    "User",
                required:
                    true,
                index:
                    true,
            },
            recipientRole: {
                type:
                    String,
                enum:
                    Object.values(
                        NotificationRecipientRole,
                    ),
                required:
                    true,
                index:
                    true,
            },
            type: {
                type:
                    String,
                enum:
                    Object.values(
                        NotificationType,
                    ),
                required:
                    true,
                index:
                    true,
            },
            title: {
                type:
                    String,
                required:
                    true,
                trim:
                    true,
            },
            message: {
                type:
                    String,
                required:
                    true,
                trim:
                    true,
            },
            order: {
                type:
                    Schema.Types.ObjectId,
                ref:
                    "Order",
                index:
                    true,
            },
            replacement: {
                type:
                    Schema.Types.ObjectId,
                ref:
                    "ReplacementRequest",
                index:
                    true,
            },
            isRead: {
                type:
                    Boolean,
                default:
                    false,
                index:
                    true,
            },
        },
        {
            timestamps:
                true,
        },
    );
// =========================================
// MODEL
// =========================================
NotificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
const Notification:
    Model<INotification> =
    mongoose.models.Notification ||
    mongoose.model<INotification>(
        "Notification",
        NotificationSchema,
    );
export default Notification;
