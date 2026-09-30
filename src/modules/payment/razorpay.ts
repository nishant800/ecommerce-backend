import "dotenv/config";
import Razorpay from "razorpay";

let instance: Razorpay | null = null;

const getRazorpayClient = (): Razorpay => {
    if (instance) {
        return instance;
    }

    const keyId =
        process.env.RAZORPAY_KEY_ID;

    const keySecret =
        process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error(
            "Razorpay payment credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before using online payments.",
        );
    }

    instance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });

    return instance;
};

// Lazy Razorpay initialization.
//
// Backend startup and unrelated tests no longer crash
// simply because Razorpay credentials are not loaded yet.
// Credentials are required only when a Razorpay operation
// is actually performed.
const razorpay = new Proxy(
    {} as Razorpay,
    {
        get(_target, property) {
            const client =
                getRazorpayClient() as unknown as Record<
                    PropertyKey,
                    unknown
                >;

            const value =
                client[property];

            return typeof value === "function"
                ? value.bind(client)
                : value;
        },

        set(_target, property, value) {
            const client =
                getRazorpayClient() as unknown as Record<
                    PropertyKey,
                    unknown
                >;

            client[property] = value;

            return true;
        },
    },
);

export default razorpay;