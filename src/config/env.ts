import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT || "5000",
    MONGO_URI:
        process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ecommerce",
    JWT_SECRET: process.env.JWT_SECRET || "",
    GOOGLE_WEB_CLIENT_ID:
        process.env.GOOGLE_WEB_CLIENT_ID || "",
};
