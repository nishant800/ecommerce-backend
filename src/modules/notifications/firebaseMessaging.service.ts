import {
    getMessaging,
    MulticastMessage,
} from "firebase-admin/messaging";
import "../../config/firebaseAdmin.js";
import User from "../users/user.model.js";
export interface PushNotificationInput {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}
interface FcmTokenRecord {
    token: string;
    platform: "android" | "ios";
    updatedAt: Date;
}
interface UserWithFcmTokens {
    fcmTokens?: FcmTokenRecord[];
}
const MAX_FCM_TOKENS = 500;
const chunk = <T>(
    values: T[],
    size: number,
): T[][] => {
    const result: T[][] = [];
    for (
        let i = 0;
        i < values.length;
        i += size
    ) {
        result.push(
            values.slice(
                i,
                i + size,
            ),
        );
    }
    return result;
};
export class FirebaseMessagingService {
    static async sendToUser(
        input: PushNotificationInput,
    ): Promise<void> {
        try {
            const user =
                await User.findById(
                    input.userId,
                ).select("fcmTokens");
            if (!user) {
                return;
            }
            const userWithFcmTokens =
                user as typeof user &
                UserWithFcmTokens;
            const tokens: string[] =
                Array.from(
                    new Set(
                        (
                            userWithFcmTokens
                                .fcmTokens ||
                            []
                        )
                            .map(
                                (
                                    entry: FcmTokenRecord,
                                ) =>
                                    entry.token,
                            )
                            .filter(
                                (
                                    token,
                                ): token is string =>
                                    Boolean(
                                        token,
                                    ),
                            ),
                    ),
                );
            if (tokens.length === 0) {
                return;
            }
            const tokenChunks =
                chunk(
                    tokens,
                    MAX_FCM_TOKENS,
                );
            for (const tokenChunk of tokenChunks) {
                const message: MulticastMessage =
                {
                    tokens: tokenChunk,
                    notification: {
                        title:
                            input.title,
                        body:
                            input.body,
                    },
                    data:
                        input.data ||
                        {},
                    android: {
                        priority:
                            "high",
                        notification:
                        {
                            sound:
                                "default",
                        },
                    },
                };
                const result =
                    await getMessaging()
                        .sendEachForMulticast(
                            message,
                        );
                const invalidTokens: string[] =
                    [];
                result.responses.forEach(
                    (
                        response,
                        index,
                    ) => {
                        if (
                            response.success
                        ) {
                            return;
                        }
                        const code =
                            response.error
                                ?.code;
                        if (
                            code ===
                            "messaging/registration-token-not-registered" ||
                            code ===
                            "messaging/invalid-registration-token"
                        ) {
                            const token =
                                tokenChunk[
                                index
                                ];
                            if (
                                token
                            ) {
                                invalidTokens.push(
                                    token,
                                );
                            }
                        }
                    },
                );
                if (
                    invalidTokens.length >
                    0
                ) {
                    await User.updateOne(
                        {
                            _id:
                                input.userId,
                        },
                        {
                            $pull: {
                                fcmTokens: {
                                    token: {
                                        $in:
                                            invalidTokens,
                                    },
                                },
                            },
                        },
                    );
                }
            }
        } catch (error) {
            // FCM failure must never
            // break the main business
            // operation.
            console.error(
                "FCM SEND ERROR:",
                error,
            );
        }
    }
}