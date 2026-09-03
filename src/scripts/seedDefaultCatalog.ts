import Brand from "../modules/brands/brand.model.js";
import Category from "../modules/categories/category.model.js";

const categories = [
    {
        name: "Bangles",
        slug: "bangles",
        description: "Bangles, bracelets, and fashion jewellery.",
    },
    {
        name: "Watches",
        slug: "watches",
        description: "Wrist watches and watch accessories.",
    },
    {
        name: "Cosmetics",
        slug: "cosmetics",
        description: "Makeup, skincare, and beauty products.",
    },
];

const brands = [
    {
        name: "Unbranded",
        slug: "unbranded",
        description: "Products without a manufacturer brand.",
    },
];

/** Adds the basic seller catalogue without changing existing catalogue records. */
export const seedDefaultCatalog = async () => {
    await Promise.all(
        categories.map(category =>
            Category.updateOne(
                { slug: category.slug },
                { $setOnInsert: category },
                { upsert: true },
            ),
        ),
    );

    await Promise.all(
        brands.map(brand =>
            Brand.updateOne(
                { slug: brand.slug },
                { $setOnInsert: brand },
                { upsert: true },
            ),
        ),
    );
};
