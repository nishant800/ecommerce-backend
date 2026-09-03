import authRoutes from "./modules/auth/auth.routes.js";

import productRoutes from "./modules/products/index.js";

import express from "express";

import cors from "cors";

import helmet from "helmet";

import morgan from "morgan";

import compression from "compression";

import categoryRoutes from "./modules/categories/category.routes.js";

import brandRoutes from "./modules/brands/brand.routes.js";

import uploadRoutes from "./routes/upload.routes.js";

import cartRoutes from "./modules/cart/index.js";

import wishlistRoutes from "./modules/wishlist/index.js";

import addressRoutes from "./modules/address/index.js";

import orderRoutes from "./routes/order.routes.js";

import paymentRoutes from "./modules/payment/index.js";

import paymentWebhookRoutes from "./modules/payment/payment.webhook.routes.js";

import userRoutes from "./modules/users/user.routes.js";

import sellerRoutes from "./modules/seller/index.js";

import subcategoryRoutes from "./modules/subcategories/subcategory.routes.js";

import policyRoutes from "./modules/policies/index.js";

import replacementRoutes from "./modules/replacements/replacement.routes.js";

import notificationRoutes from "./notifications/notification.routes.js";
import imageSearchRoutes from "./modules/products/product-image-search.routes.js";
import reviewRoutes from "./modules/reviews/review.routes.js";
const app = express();

app.use(cors());

app.use(helmet());

app.use(compression());

app.use(morgan("dev"));

// =========================================
// RAZORPAY WEBHOOK
//
// MUST COME BEFORE express.json()
// =========================================

app.use(
    "/api/payment/webhook",
    express.raw({
        type: "application/json",
    }),
    paymentWebhookRoutes,
);

// =========================================
// NORMAL BODY PARSERS
// =========================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true,
    }),
);

app.use(
    "/api/auth",
    authRoutes,
);

app.use(
    "/api/users",
    userRoutes,
);
app.use(
    "/api/products/image-search",
    imageSearchRoutes,
);
app.use(
    "/api/products",
    productRoutes,
);

app.use(
    "/api/categories",
    categoryRoutes,
);

app.use(
    "/api/subcategories",
    subcategoryRoutes,
);

app.use(
    "/api/brands",
    brandRoutes,
);

app.use(
    "/api/policies",
    policyRoutes,
);

app.use(
    "/api/upload",
    uploadRoutes,
);

app.use(
    "/api/cart",
    cartRoutes,
);

app.use(
    "/api/wishlist",
    wishlistRoutes,
);

app.use(
    "/api/address",
    addressRoutes,
);

app.use(
    "/api/seller",
    sellerRoutes,
);

app.use(
    "/api/orders",
    orderRoutes,
);

app.use(
    "/api/payment",
    paymentRoutes,
);

app.use(
    "/api/replacements",
    replacementRoutes,
);

app.use(
    "/api/notifications",
    notificationRoutes,
);

app.use(
    "/api/reviews",
    reviewRoutes,
);

app.get(
    "/health",
    (_req, res) => {

        res.json({
            success: true,
            message:
                "Backend Working",
        });

    },
);


export default app;
