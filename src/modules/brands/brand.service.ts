import mongoose from "mongoose";
import Brand from "./brand.model.js";
import Category from "../categories/category.model.js";
// =========================================
// SLUG HELPER
// =========================================
const createSlug = (
    value: string
) => {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
};
// =========================================
// CATEGORY VALIDATION
// =========================================
const validateCategory = async (
    categoryId: string
) => {
    const category = String(
        categoryId || ""
    ).trim();
    if (!category) {
        throw new Error(
            "Category is required for brand"
        );
    }
    if (
        !mongoose.isValidObjectId(
            category
        )
    ) {
        throw new Error(
            "Invalid category"
        );
    }
    const exists =
        await Category.findById(
            category
        );
    if (!exists) {
        throw new Error(
            "Category not found"
        );
    }
    return category;
};
// =========================================
// BRAND SERVICE
// =========================================
export class BrandService {
    // =========================================
    // CREATE
    // =========================================
    static async create(
        data: any
    ) {
        const name =
            String(
                data.name || ""
            ).trim();
        if (!name) {
            throw new Error(
                "Brand name is required"
            );
        }
        const category =
            await validateCategory(
                data.category
            );
        const slug =
            createSlug(
                data.slug || name
            );
        if (!slug) {
            throw new Error(
                "Brand name is required"
            );
        }
        // Check duplicate brand inside same category
        const exists =
            await Brand.findOne({
                category,
                slug,
            });
        if (exists) {
            throw new Error(
                "Brand already exists in this category"
            );
        }
        return Brand.create({
            ...data,
            name,
            slug,
            category,
            isActive: true,
        });
    }
    // =========================================
    // GET ALL ACTIVE BRANDS
    // =========================================
    // Optional:
    // ?categoryId=<categoryId>
    static async getAll(
        categoryId?: string
    ) {
        const filter: any = {
            isActive: true,
        };
        if (categoryId) {
            const category =
                await validateCategory(
                    categoryId
                );
            filter.category =
                category;
        }
        return Brand.find(
            filter
        )
            .populate(
                "category",
                "name slug"
            )
            .sort({
                createdAt: -1,
            });
    }
    // =========================================
    // GET BY ID
    // =========================================
    static async getById(
        id: string
    ) {
        return Brand.findById(
            id
        ).populate(
            "category",
            "name slug"
        );
    }
    // =========================================
    // UPDATE
    // =========================================
    static async update(
        id: string,
        data: any
    ) {
        const existing =
            await Brand.findById(
                id
            );
        if (!existing) {
            return null;
        }
        const updateData: any = {
            ...data,
        };
        // -----------------------------------------
        // CATEGORY
        // -----------------------------------------
        let categoryId =
            existing.category.toString();
        if (
            updateData.category !==
            undefined
        ) {
            categoryId =
                await validateCategory(
                    updateData.category
                );
            updateData.category =
                categoryId;
        } else {
            updateData.category =
                categoryId;
        }
        // -----------------------------------------
        // NAME / SLUG
        // -----------------------------------------
        if (
            updateData.name !==
            undefined
        ) {
            updateData.name =
                String(
                    updateData.name
                ).trim();
            if (
                !updateData.name
            ) {
                throw new Error(
                    "Brand name is required"
                );
            }
            updateData.slug =
                createSlug(
                    updateData.name
                );
        } else if (
            updateData.slug !==
            undefined
        ) {
            updateData.slug =
                createSlug(
                    updateData.slug
                );
        }
        if (
            !updateData.slug
        ) {
            throw new Error(
                "Brand name is required"
            );
        }
        // -----------------------------------------
        // DUPLICATE CHECK
        // -----------------------------------------
        const duplicate =
            await Brand.findOne({
                category: categoryId,
                slug: updateData.slug,
                _id: {
                    $ne: id,
                },
            });
        if (duplicate) {
            throw new Error(
                "Another brand with this name already exists in this category"
            );
        }
        // -----------------------------------------
        // UPDATE
        // -----------------------------------------
        return Brand.findOneAndUpdate(
            {
                _id: id,
            },
            {
                $set: updateData,
            },
            {
                new: true,
                runValidators: true,
            }
        ).populate(
            "category",
            "name slug"
        );
    }
    // =========================================
    // DELETE / DEACTIVATE
    // =========================================
    static async delete(
        id: string
    ) {
        return Brand.findOneAndUpdate(
            {
                _id: id,
            },
            {
                $set: {
                    isActive: false,
                },
            },
            {
                new: true,
            }
        ).populate(
            "category",
            "name slug"
        );
    }
}