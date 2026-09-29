import fs from "node:fs";
import path from "node:path";
import {
    initializeApp,
    cert,
    getApps,
    type ServiceAccount,
} from "firebase-admin/app";
import {
    getAuth,
} from "firebase-admin/auth";
import {
    getMessaging,
} from "firebase-admin/messaging";
// =========================================
// FIREBASE SERVICE ACCOUNT
// =========================================
const getFirebaseServiceAccount =
    (): ServiceAccount => {
        // =========================================
        // PRODUCTION / RENDER
        // =========================================
        const envServiceAccount =
            process.env.FIREBASE_SERVICE_ACCOUNT;
        if (envServiceAccount) {
            try {
                const parsed =
                    JSON.parse(
                        envServiceAccount,
                    );
                console.log(
                    "🔥 Firebase credentials loaded from environment",
                );
                return parsed as ServiceAccount;
            } catch (error) {
                console.error(
                    "❌ Invalid FIREBASE_SERVICE_ACCOUNT JSON",
                );
                throw new Error(
                    "FIREBASE_SERVICE_ACCOUNT contains invalid JSON.",
                );
            }
        }
        // =========================================
        // LOCAL DEVELOPMENT
        // =========================================
        const serviceAccountPath =
            path.resolve(
                process.cwd(),
                "firebase-service-account.json",
            );
        if (
            fs.existsSync(
                serviceAccountPath,
            )
        ) {
            try {
                const serviceAccount =
                    JSON.parse(
                        fs.readFileSync(
                            serviceAccountPath,
                            "utf8",
                        ),
                    );
                console.log(
                    "🔥 Firebase credentials loaded from local file",
                );
                return serviceAccount as ServiceAccount;
            } catch (error) {
                console.error(
                    "❌ Invalid local Firebase service account JSON",
                );
                throw new Error(
                    "firebase-service-account.json contains invalid JSON.",
                );
            }
        }
        // =========================================
        // NO FIREBASE CREDENTIALS
        // =========================================
        throw new Error(
            "Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT or provide firebase-service-account.json.",
        );
    };
// =========================================
// LOAD FIREBASE CREDENTIALS
// =========================================
const serviceAccount =
    getFirebaseServiceAccount();
// =========================================
// INITIALIZE FIREBASE ADMIN
// =========================================
const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(
                serviceAccount,
            ),
        });
// =========================================
// FIREBASE ADMIN AUTH
// =========================================
export const firebaseAdminAuth =
    getAuth(firebaseApp);
// =========================================
// FIREBASE ADMIN MESSAGING
// =========================================
export const firebaseAdminMessaging =
    getMessaging(firebaseApp);
// =========================================
// DEFAULT FIREBASE APP
// =========================================
export default firebaseApp;