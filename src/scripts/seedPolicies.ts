import Policy, {
    PolicyType,
} from "../modules/policies/policy.model.js";


// =========================================
// DEFAULT POLICIES
// =========================================

const defaultPolicies: {
    type: PolicyType;
    title: string;
    content: string;
    version: string;
}[] = [

        {
            type: "terms",

            title: "Terms & Conditions",

            version: "1.0",

            content:
                "Please review the Terms & Conditions before using our platform or placing an order.",
        },


        {
            type: "privacy",

            title: "Privacy Policy",

            version: "1.0",

            content:
                "Please review our Privacy Policy to understand how information is collected, used, and protected.",
        },


        {
            type: "replacement",

            title: "Replacement Policy",

            version: "1.0",

            content:
                "Eligible products may be replaced according to the applicable replacement conditions. Replacement eligibility, replacement period, and eligible reasons may vary by product.",
        },


        {
            type: "cancellation",

            title: "Cancellation Policy",

            version: "1.0",

            content:
                "Orders may be cancelled according to the applicable cancellation conditions and order status.",
        },


        {
            type: "shipping",

            title: "Shipping & Delivery Policy",

            version: "1.0",

            content:
                "Delivery availability and estimated delivery time may vary depending on the product, seller, delivery location, and other applicable conditions.",
        },


        {
            type: "refund",

            title: "Refund Policy",

            version: "1.0",

            content:
                "Where a refund is applicable, it will be processed according to the applicable order, payment, cancellation, and replacement conditions.",
        },

    ];


// =========================================
// SEED POLICIES
// =========================================

export const seedPolicies =
    async () => {

        for (
            const policy
            of defaultPolicies
        ) {

            await Policy.findOneAndUpdate(

                {
                    type:
                        policy.type,
                },

                {
                    $set: {
                        title:
                            policy.title,

                        content:
                            policy.content,

                        version:
                            policy.version,

                        active:
                            true,
                    },
                },

                {
                    upsert: true,

                    new: true,

                    setDefaultsOnInsert:
                        true,
                },
            );

        }

        console.log(
            "✅ Default policies seeded successfully."
        );

    };