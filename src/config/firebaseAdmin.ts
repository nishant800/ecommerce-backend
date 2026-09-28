import fs from "node:fs";
import path from "node:path";
import {
    initializeApp,
    cert,
    getApps,
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
const serviceAccountPath = path.resolve(
    process.cwd(),
    "firebase-service-account.json",
);
if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
        `Firebase service account file not found: ${serviceAccountPath}`,
    );
}
const serviceAccount = JSON.parse(
    fs.readFileSync(
        serviceAccountPath,
        "utf8",
    ),
);
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