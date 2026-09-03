import Brand from "./brand.model.js";


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

        const slug =
            createSlug(
                data.slug || name
            );

        if (!slug) {
            throw new Error(
                "Brand name is required"
            );
        }

        const exists =
            await Brand.findOne({
                slug,
            });

        if (exists) {
            throw new Error(
                "Brand already exists"
            );
        }

        return Brand.create({
            ...data,
            name,
            slug,
            isActive: true,
        });
    }


    // =========================================
    // GET ALL ACTIVE BRANDS
    // =========================================

    static async getAll() {

        return Brand.find({
            isActive: true,
        }).sort({
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
        );
    }
}