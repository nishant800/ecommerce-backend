import mongoose from "mongoose";
import Product from "../modules/products/product.model.js";
import User from "../modules/users/user.model.js";

const MONGO_URI =
    "mongodb://localhost:27017/ecommerce";

const PRODUCT_ID =
    "6a7465a118268ff684612251";

const SELLER_ID =
    "6a79c91bbee512b23ef52b35";

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);

        console.log("✅ MongoDB connected");

        const seller = await User.findOne({
            _id: SELLER_ID,
            role: "seller",
        });

        if (!seller) {
            throw new Error(
                "Seller not found or user is not a seller."
            );
        }

        console.log(
            `✅ Seller verified: ${seller.name}`
        );

        const product =
            await Product.findById(PRODUCT_ID);

        if (!product) {
            throw new Error(
                "Product not found."
            );
        }

        console.log(
            `Product: ${product.name}`
        );

        product.seller = seller._id;

        await product.save();

        console.log(
            "✅ Seller assigned successfully"
        );

        console.log(
            "Product ID:",
            product._id.toString()
        );

        console.log(
            "Seller ID:",
            product.seller.toString()
        );

        await mongoose.disconnect();

        console.log(
            "✅ MongoDB disconnected"
        );

    } catch (error) {
        console.error(
            "❌ ERROR:",
            error
        );

        try {
            await mongoose.disconnect();
        } catch {}

        process.exit(1);
    }
};

run();