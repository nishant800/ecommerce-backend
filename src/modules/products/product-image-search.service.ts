
import { pipeline, RawImage } from '@huggingface/transformers';
import Product from './product.model.js';

interface ImageSearchMatch {
    product: any;
    score: number;
    matchedImage: string;
    matchedImageType: string;
    matchedVariantIndex: number | null;
}

let extractorPromise: Promise<any> | null = null;

const getExtractor = async () => {
    if (!extractorPromise) {
        extractorPromise = pipeline(
            'image-feature-extraction',
            process.env.IMAGE_SEARCH_MODEL ||
            'Xenova/clip-vit-base-patch32',
        );
    }

    return extractorPromise;
};

const toFiniteNumber = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const normalizeVector = (values: ArrayLike<number>) => {
    let magnitude = 0;

    for (let index = 0; index < values.length; index += 1) {
        const value = toFiniteNumber(values[index]);
        magnitude += value * value;
    }

    magnitude = Math.sqrt(magnitude);

    if (!magnitude) {
        return [];
    }

    return Array.from(
        { length: values.length },
        (_, index) =>
            toFiniteNumber(values[index]) /
            magnitude,
    );
};

const cosineSimilarity = (
    first: number[],
    second: number[],
) => {
    if (
        !first.length ||
        first.length !== second.length
    ) {
        return -1;
    }

    let score = 0;

    for (let index = 0; index < first.length; index += 1) {
        score += first[index] * second[index];
    }

    return score;
};

const embeddingCache = new Map<string, number[]>();

const addImageUrl = (
    urls: string[],
    value: unknown,
) => {
    if (typeof value !== 'string') {
        return;
    }

    const url = value.trim();

    if (url && !urls.includes(url)) {
        urls.push(url);
    }
};

interface ImageCandidate {
    url: string;
    type: string;
    variantIndex: number | null;
}

const addImageCandidate = (
    candidates: ImageCandidate[],
    urlValue: unknown,
    type: string,
    variantIndex: number | null,
) => {
    if (typeof urlValue !== 'string') {
        return;
    }

    const url = urlValue.trim();

    if (!url) {
        return;
    }

    if (
        candidates.some(
            candidate =>
                candidate.url === url,
        )
    ) {
        return;
    }

    candidates.push({
        url,
        type,
        variantIndex,
    });
};

const getProductImageCandidates = (
    product: any,
) => {
    const candidates: ImageCandidate[] = [];

    addImageCandidate(
        candidates,
        product?.thumbnail,
        'thumbnail',
        null,
    );

    if (Array.isArray(product?.images)) {
        product.images.forEach(
            (image: any) =>
                addImageCandidate(
                    candidates,
                    typeof image === 'string'
                        ? image
                        : image?.url,
                    'product',
                    null,
                ),
        );
    }

    if (Array.isArray(product?.variants)) {
        product.variants.forEach(
            (variant: any, variantIndex: number) => {
                addImageCandidate(
                    candidates,
                    variant?.colorImage,
                    'variant-color',
                    variantIndex,
                );

                addImageCandidate(
                    candidates,
                    variant?.image,
                    'variant',
                    variantIndex,
                );

                if (
                    Array.isArray(
                        variant?.shades,
                    )
                ) {
                    variant.shades.forEach(
                        (shade: any) =>
                            addImageCandidate(
                                candidates,
                                shade?.image,
                                'variant-shade',
                                variantIndex,
                            ),
                    );
                }

                if (
                    Array.isArray(
                        variant?.colors,
                    )
                ) {
                    variant.colors.forEach(
                        (color: any) =>
                            addImageCandidate(
                                candidates,
                                color?.image,
                                'variant-color-option',
                                variantIndex,
                            ),
                    );
                }
            },
        );
    }

    return candidates;
};

const extractEmbedding = async (
    image: any,
) => {
    const extractor = await getExtractor();

    const output =
        await extractor(
            image,
            {
                pooling: 'mean',
            },
        );

    if (
        !output?.data ||
        typeof output.data.length !== 'number'
    ) {
        throw new Error(
            'Unable to extract image features.',
        );
    }

    return normalizeVector(
        output.data,
    );
};

const getImageEmbedding = async (
    imageUrl: string,
) => {
    const cached = embeddingCache.get(
        imageUrl,
    );

    if (cached) {
        return cached;
    }

    const image =
        await RawImage.read(
            imageUrl,
        );

    const embedding =
        await extractEmbedding(
            image,
        );

    if (embedding.length) {
        embeddingCache.set(
            imageUrl,
            embedding,
        );
    }

    return embedding;
};

const getEnvNumber = (
    name: string,
    fallback: number,
) => {
    const parsed = Number(
        process.env[name],
    );

    return Number.isFinite(parsed) &&
        parsed > 0
        ? parsed
        : fallback;
};

export class ProductImageSearchService {
    static async search(
        buffer: Buffer,
        mimeType?: string,
    ): Promise<ImageSearchMatch[]> {
        if (!buffer?.length) {
            throw new Error(
                'Image file is empty.',
            );
        }

        const maxProducts =
            Math.floor(
                getEnvNumber(
                    'IMAGE_SEARCH_MAX_PRODUCTS',
                    500,
                ),
            );

        const topK =
            Math.floor(
                getEnvNumber(
                    'IMAGE_SEARCH_TOP_K',
                    20,
                ),
            );

        const configuredMinimum =
            Number(
                process.env
                    .IMAGE_SEARCH_MIN_SCORE,
            );

        const minimumScore =
            Number.isFinite(
                configuredMinimum,
            )
                ? configuredMinimum
                : 0.55;

        const configuredMargin =
            Number(
                process.env
                    .IMAGE_SEARCH_MIN_MARGIN,
            );

        const minimumMargin =
            Number.isFinite(
                configuredMargin,
            )
                ? configuredMargin
                : 0.08;

        const blob =
            new Blob(
                [new Uint8Array(buffer)],
                {
                    type:
                        mimeType ||
                        'image/jpeg',
                },
            );

        const queryImage =
            await RawImage.fromBlob(
                blob,
            );

        const queryEmbedding =
            await extractEmbedding(
                queryImage,
            );

        if (!queryEmbedding.length) {
            throw new Error(
                'Unable to create image embedding.',
            );
        }

        const products =
            await Product.find({
                active: true,
            })
                .populate('category')
                .populate('subcategory')
                .populate('brand')
                .limit(maxProducts)
                .lean();

        const matches: ImageSearchMatch[] = [];

        for (const product of products) {
            const imageCandidates =
                getProductImageCandidates(
                    product,
                );

            let bestScore = -1;
            let bestCandidate:
                ImageCandidate | null =
                null;

            for (
                const candidate
                of imageCandidates
            ) {
                try {
                    const embedding =
                        await getImageEmbedding(
                            candidate.url,
                        );

                    const score =
                        cosineSimilarity(
                            queryEmbedding,
                            embedding,
                        );

                    if (
                        score > bestScore
                    ) {
                        bestScore = score;
                        bestCandidate =
                            candidate;
                    }
                } catch (error) {
                    console.warn(
                        'IMAGE SEARCH IMAGE SKIPPED:',
                        candidate.url,
                        error,
                    );
                }
            }

            if (
                bestCandidate &&
                bestScore >= minimumScore
            ) {
                matches.push({
                    product,
                    score: bestScore,
                    matchedImage:
                        bestCandidate.url,
                    matchedImageType:
                        bestCandidate.type,
                    matchedVariantIndex:
                        bestCandidate.variantIndex,
                });
            }
        }

        matches.sort(
            (first, second) =>
                second.score -
                first.score,
        );

        if (!matches.length) {
            return [];
        }

        const bestScore =
            matches[0].score;

        const relevantMatches =
            matches.filter(
                match =>
                    match.score >=
                    minimumScore &&
                    (
                        bestScore -
                        match.score
                    ) <=
                    minimumMargin,
            );

        return relevantMatches.slice(
            0,
            topK,
        );
    }
}
