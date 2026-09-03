import mongoose from "mongoose";
import dotenv from "dotenv";
import Category from "../categories/category.model.js";
import Subcategory from "./subcategory.model.js";

dotenv.config();

const slugify = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const subcategoryData: Record<
    string,
    string[]
> = {
    Bangles: [
        "Bridal Bangles",
        "Designer Bangles",
        "Traditional Bangles",
        "Fancy Bangles",
        "Party Wear Bangles",
        "Daily Wear Bangles",
        "Gold Plated Bangles",
        "Silver Bangles",
        "Kundan Bangles",
        "Meenakari Bangles",
        "Stone Bangles",
        "Crystal Bangles",
        "Glass Bangles",
        "Metal Bangles",
        "Oxidised Bangles",
        "Kids Bangles",
        "Bangle Sets",
    ],

    Watches: [
        "Analog Watches",
        "Digital Watches",
        "Smart Watches",
        "Sports Watches",
        "Luxury Watches",
        "Fashion Watches",
        "Casual Watches",
        "Formal Watches",
        "Couple Watches",
        "Men's Watches",
        "Women's Watches",
        "Kids Watches",
        "Chronograph Watches",
        "Leather Strap Watches",
        "Metal Strap Watches",
        "Silicone Strap Watches",
        "Automatic Watches",
        "Quartz Watches",
    ],

    Cosmetics: [
        "Makeup",
        "Lipstick",
        "Lip Gloss",
        "Lip Liner",
        "Foundation",
        "BB Cream",
        "CC Cream",
        "Concealer",
        "Compact Powder",
        "Loose Powder",
        "Blush",
        "Highlighter",
        "Bronzer",
        "Contour",
        "Primer",
        "Setting Spray",
        "Eye Makeup",
        "Eyeliner",
        "Kajal",
        "Mascara",
        "Eyeshadow",
        "Eyebrow Pencil",
        "Nail Care",
        "Nail Polish",
        "Nail Art",
        "Skin Care",
        "Face Wash",
        "Face Cream",
        "Moisturizer",
        "Serum",
        "Face Mask",
        "Sunscreen",
        "Toner",
        "Scrub",
        "Hair Care",
        "Shampoo",
        "Conditioner",
        "Hair Oil",
        "Hair Serum",
        "Hair Color",
        "Body Care",
        "Body Lotion",
        "Body Wash",
        "Body Scrub",
        "Hand Care",
        "Foot Care",
        "Fragrance",
        "Perfume",
        "Body Spray",
        "Deodorant",
        "Makeup Brushes",
        "Makeup Tools",
        "Beauty Accessories",
    ],
};

const seed = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error(
            "MONGODB_URI is not defined"
        );
    }

    await mongoose.connect(uri);

    let created = 0;
    let skipped = 0;
    let missingCategories = 0;

    for (
        const [categoryName, names]
        of Object.entries(
            subcategoryData
        )
    ) {
        const category =
            await Category.findOne({
                name: {
                    $regex:
                        `^${categoryName}$`,
                    $options: "i",
                },
            });

        if (!category) {
            console.warn(
                `Category not found: ${categoryName}`
            );
            missingCategories++;
            continue;
        }

        for (const name of names) {
            const slug =
                slugify(name);

            const existing =
                await Subcategory.findOne({
                    category:
                        category._id,
                    slug,
                });

            if (existing) {
                skipped++;
                continue;
            }

            await Subcategory.create({
                name,
                slug,
                image: "",
                description: "",
                category:
                    category._id,
                isActive: true,
            });

            created++;
            console.log(
                `Created: ${category.name} → ${name}`
            );
        }
    }

    console.log(
        `\nDone. Created: ${created}, skipped: ${skipped}, missing categories: ${missingCategories}`
    );

    await mongoose.disconnect();
};

seed().catch(
    async (error) => {
        console.error(
            "Subcategory seed failed:",
            error
        );

        try {
            await mongoose.disconnect();
        } catch { }

        process.exit(1);
    }
);