import Subcategory from "./subcategory.model.js";


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


export class SubcategoryService {

    // =========================================
    // CREATE
    // =========================================

    static async create(
        data: any
    ) {

        const category =
            String(
                data.category || ""
            ).trim();

        if (!category) {
            throw new Error(
                "Category is required"
            );
        }

        const name =
            String(
                data.name || ""
            ).trim();

        if (!name) {
            throw new Error(
                "Subcategory name is required"
            );
        }

        const slug =
            createSlug(
                data.slug || name
            );

        if (!slug) {
            throw new Error(
                "Subcategory name is required"
            );
        }

        const exists =
            await Subcategory.findOne({
                category,
                slug,
            });

        if (exists) {
            throw new Error(
                "Subcategory already exists in this category"
            );
        }

        return Subcategory.create({
            ...data,
            name,
            slug,
            category,
        });
    }


    // =========================================
    // GET ALL ACTIVE
    // =========================================

    static async getAll(
        categoryId?: string
    ) {

        const filter: any = {
            isActive: true,
        };

        if (categoryId) {
            filter.category =
                categoryId;
        }

        return Subcategory.find(
            filter
        )
            .populate(
                "category",
                "name slug image"
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

        return Subcategory.findById(
            id
        ).populate(
            "category",
            "name slug image"
        );
    }


    // =========================================
    // UPDATE
    // =========================================

    static async update(
        id: string,
        data: any
    ) {

        const updateData = {
            ...data,
        };

        if (
            updateData.name
        ) {

            updateData.name =
                String(
                    updateData.name
                ).trim();

            updateData.slug =
                createSlug(
                    updateData.name
                );
        }

        // Prevent changing the
        // parent category here.
        delete updateData.category;

        return Subcategory.findOneAndUpdate(
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
        )
            .populate(
                "category",
                "name slug image"
            );
    }


    // =========================================
    // DELETE / DEACTIVATE
    // =========================================

    static async delete(
        id: string
    ) {

        return Subcategory.findByIdAndUpdate(
            id,
            {
                isActive: false,
            },
            {
                new: true,
            }
        );
    }
}