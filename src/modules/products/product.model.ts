import mongoose, {
    Schema,
    Document,
    Model,
} from 'mongoose';


// =========================================
// PRODUCT IMAGE
// =========================================

export interface IProductImage {
    url: string;
    publicId?: string;
}


// =========================================
// BANGLE SIZE
// =========================================

export interface IBangleSize {
    size: string;
    stock: number;
}


// =========================================
// COSMETIC SHADE
// =========================================

export interface ICosmeticShade {
    shade: string;
    stock: number;
    image?: string;
    publicId?: string;
}


// =========================================
// WATCH COLOR
// =========================================

export interface IWatchColor {
    color: string;
    stock: number;
    image?: string;
    publicId?: string;
}


// =========================================
// PRODUCT VARIANT
// =========================================

export interface IVariant {

    active?: boolean;

    color?: string;

    // Bangles
    colorImage?: string;
    colorImagePublicId?: string;
    design?: string;
    sizes?: IBangleSize[];

    // Cosmetics
    shades?: ICosmeticShade[];

    // Watches
    colors?: IWatchColor[];

    // Existing fields
    strap?: string;
    style?: string;
    volume?: string;
    material?: string;

    price: number;
    discountPrice?: number;
    stock: number;
    sku: string;
}


// =========================================
// PRODUCT INTERFACE
// =========================================

export interface IProduct extends Document {

    name: string;

    slug: string;

    shortDescription: string;

    description: string;

    price: number;

    discountPrice: number;

    costPrice: number;

    sku: string;

    barcode: string;

    stock: number;

    lowStockAlert: number;


    // =====================================
    // CATEGORY
    // =====================================

    category: mongoose.Types.ObjectId;


    // =====================================
    // SUBCATEGORY
    // =====================================

    subcategory: mongoose.Types.ObjectId;


    // =====================================
    // BRAND
    // =====================================

    brand: mongoose.Types.ObjectId;


    // =====================================
    // SELLER
    // =====================================

    seller: mongoose.Types.ObjectId;

    thumbnail: string;

    images: IProductImage[];

    variants: IVariant[];

    rating: number;

    reviewCount: number;

    featured: boolean;

    trending: boolean;

    active: boolean;


    // =====================================
    // CUSTOMER POLICY
    // =====================================

    returnAllowed: boolean;

    replacementAllowed: boolean;

    replacementWindowDays: number;

    replacementReasons: string[];
}


// =========================================
// PRODUCT SCHEMA
// =========================================

const ProductSchema =
    new Schema<IProduct>(
        {

            name: {
                type: String,
                required: true,
                trim: true,
            },


            slug: {
                type: String,
                required: true,
                unique: true,
            },


            shortDescription: {
                type: String,
                default: '',
            },


            description: {
                type: String,
                default: '',
            },


            price: {
                type: Number,
                required: true,
            },


            discountPrice: {
                type: Number,
                default: 0,
            },


            costPrice: {
                type: Number,
                default: 0,
            },


            sku: {
                type: String,
                required: true,
                unique: true,
            },


            barcode: {
                type: String,
                default: '',
            },


            stock: {
                type: Number,
                default: 0,
            },


            lowStockAlert: {
                type: Number,
                default: 5,
            },


            // =====================================
            // CATEGORY
            // =====================================

            category: {
                type: Schema.Types.ObjectId,
                ref: 'Category',
                required: true,
            },


            // =====================================
            // SUBCATEGORY
            // =====================================

            subcategory: {
                type: Schema.Types.ObjectId,
                ref: 'Subcategory',
                required: true,
            },


            // =====================================
            // BRAND
            // =====================================

            brand: {
                type: Schema.Types.ObjectId,
                ref: 'Brand',
                required: true,
            },


            // =====================================
            // SELLER
            // =====================================

            seller: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
                index: true,
            },


            thumbnail: {
                type: String,
                default: '',
            },


            images: [
                {
                    url: {
                        type: String,
                        default: '',
                    },

                    publicId: {
                        type: String,
                        default: '',
                    },
                },
            ],


            // =====================================
            // VARIANTS
            // =====================================

            variants: [

                {

                    active: {
                        type: Boolean,
                        default: true,
                    },

                    color: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    colorImage: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    colorImagePublicId: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    design: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    // ---------------------------------
                    // BANGLE SIZES
                    // ---------------------------------

                    sizes: [

                        {

                            size: {
                                type: String,
                                required: true,
                                trim: true,
                            },


                            stock: {
                                type: Number,
                                required: true,
                                min: 0,
                                default: 0,
                            },

                        },

                    ],


                    // ---------------------------------
                    // COSMETIC SHADES
                    // ---------------------------------

                    shades: [

                        {

                            shade: {
                                type: String,
                                required: true,
                                trim: true,
                            },


                            stock: {
                                type: Number,
                                required: true,
                                min: 0,
                                default: 0,
                            },


                            image: {
                                type: String,
                                default: '',
                            },


                            publicId: {
                                type: String,
                                default: '',
                            },

                        },

                    ],


                    // ---------------------------------
                    // WATCH COLORS
                    // ---------------------------------

                    colors: [

                        {

                            color: {
                                type: String,
                                required: true,
                                trim: true,
                            },


                            stock: {
                                type: Number,
                                required: true,
                                min: 0,
                                default: 0,
                            },


                            image: {
                                type: String,
                                default: '',
                            },


                            publicId: {
                                type: String,
                                default: '',
                            },

                        },

                    ],


                    // ---------------------------------
                    // EXISTING FIELDS
                    // ---------------------------------

                    strap: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    style: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    volume: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    material: {
                        type: String,
                        default: '',
                        trim: true,
                    },


                    price: {
                        type: Number,
                        required: true,
                        min: 0,
                    },

                    discountPrice: {
                        type: Number,
                        default: 0,
                        min: 0,
                    },


                    stock: {
                        type: Number,
                        required: true,
                        min: 0,
                        default: 0,
                    },


                    sku: {
                        type: String,
                        required: true,
                        trim: true,
                    },

                },

            ],


            rating: {
                type: Number,
                default: 0,
            },


            reviewCount: {
                type: Number,
                default: 0,
            },


            featured: {
                type: Boolean,
                default: false,
            },


            trending: {
                type: Boolean,
                default: false,
            },


            active: {
                type: Boolean,
                default: true,
            },


            // =====================================
            // CUSTOMER POLICY
            // =====================================

            returnAllowed: {
                type: Boolean,
                default: false,
            },


            replacementAllowed: {
                type: Boolean,
                default: true,
            },


            replacementWindowDays: {
                type: Number,
                default: 7,
                min: 0,
            },


            replacementReasons: {
                type: [String],
                default: [
                    'Damaged product',
                    'Defective product',
                    'Wrong product received',
                    'Missing item',
                ],
            },

        },

        {
            timestamps: true,
        },

    );



// =========================================
// SYNCHRONIZE STOCK TOTALS
// =========================================

const synchronizeProductStock = (
    product: IProduct,
) => {

    let productStock = 0;

    for (
        const variant of product.variants || []
    ) {

        const hasSizes =
            Array.isArray(variant.sizes) &&
            variant.sizes.length > 0;

        const hasShades =
            Array.isArray(variant.shades) &&
            variant.shades.length > 0;

        const hasColors =
            Array.isArray(variant.colors) &&
            variant.colors.length > 0;


        if (hasSizes) {

            variant.stock =
                variant.sizes!.reduce(
                    (
                        total: number,
                        size: IBangleSize,
                    ) =>
                        total +
                        Number(size.stock || 0),
                    0,
                );

        } else if (hasShades) {

            variant.stock =
                variant.shades!.reduce(
                    (
                        total: number,
                        shade: ICosmeticShade,
                    ) =>
                        total +
                        Number(shade.stock || 0),
                    0,
                );

        } else if (hasColors) {

            variant.stock =
                variant.colors!.reduce(
                    (
                        total: number,
                        color: IWatchColor,
                    ) =>
                        total +
                        Number(color.stock || 0),
                    0,
                );

        } else {

            variant.stock =
                Number(variant.stock || 0);

        }


        productStock +=
            Number(variant.stock || 0);

    }


    // Only synchronize product stock from variants when variants exist.
    // Normal products without variants keep their manually entered stock.
    if (
        Array.isArray(product.variants) &&
        product.variants.length > 0
    ) {
        product.stock = productStock;
    }

    return product;
};


// =========================================
// SYNCHRONIZE UPDATE PAYLOAD
// =========================================

const synchronizeUpdatePayload = (
    update: any,
) => {

    if (!update) {
        return;
    }

    const data =
        update.$set || update;


    if (
        !Array.isArray(data.variants)
    ) {
        return;
    }


    let productStock = 0;


    for (
        const variant of data.variants
    ) {

        const hasSizes =
            Array.isArray(variant.sizes) &&
            variant.sizes.length > 0;

        const hasShades =
            Array.isArray(variant.shades) &&
            variant.shades.length > 0;

        const hasColors =
            Array.isArray(variant.colors) &&
            variant.colors.length > 0;


        if (hasSizes) {

            variant.stock =
                variant.sizes.reduce(
                    (
                        total: number,
                        size: IBangleSize,
                    ) =>
                        total +
                        Number(size.stock || 0),
                    0,
                );

        } else if (hasShades) {

            variant.stock =
                variant.shades.reduce(
                    (
                        total: number,
                        shade: ICosmeticShade,
                    ) =>
                        total +
                        Number(shade.stock || 0),
                    0,
                );

        } else if (hasColors) {

            variant.stock =
                variant.colors.reduce(
                    (
                        total: number,
                        color: IWatchColor,
                    ) =>
                        total +
                        Number(color.stock || 0),
                    0,
                );

        } else {

            variant.stock =
                Number(variant.stock || 0);

        }


        productStock +=
            Number(variant.stock || 0);

    }


    // Only synchronize product stock from variants when variants exist.
    // Normal products without variants keep the stock sent by Add/Edit Product.
    if (
        Array.isArray(data.variants) &&
        data.variants.length > 0
    ) {
        data.stock = productStock;
    }

};


// =========================================
// STOCK HOOKS
// =========================================

ProductSchema.pre(
    'save',
    function (
        next: (error?: Error) => void,
    ) {

        synchronizeProductStock(
            this as IProduct,
        );

        next();

    },
);


ProductSchema.pre(
    'findOneAndUpdate',
    function (
        this: mongoose.Query<any, IProduct>,
        next: (error?: Error) => void,
    ) {

        synchronizeUpdatePayload(
            this.getUpdate(),
        );

        next();

    },
);

ProductSchema.pre(
    'findOneAndUpdate',
    function (
        this: mongoose.Query<any, IProduct>,
        next: (error?: Error) => void,
    ) {

        synchronizeUpdatePayload(
            this.getUpdate(),
        );

        next();

    },
);


// =========================================
// PRODUCT MODEL
// =========================================

const Product: Model<IProduct> =
    mongoose.model<IProduct>(
        'Product',
        ProductSchema,
    );

export default Product;
