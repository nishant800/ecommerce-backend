import { Resend } from "resend";

console.log("📧 EMAIL MODULE LOADED");

// =========================================
// RESEND EMAIL CLIENT
// =========================================

const resend = new Resend(
    process.env.RESEND_API_KEY,
);

// =========================================
// EMAIL CONFIGURATION
// =========================================

const getFromEmail = () =>
    process.env.RESEND_FROM ||
    "onboarding@resend.dev";

// =========================================
// PASSWORD RESET OTP
// =========================================

export const sendPasswordResetOTP = async (
    email: string,
    otp: string,
) => {

    console.log(
        "📨 Sending password reset OTP",
    );

    console.log(
        "To:",
        email,
    );

    try {

        const {
            data,
            error,
        } = await resend.emails.send({

            from:
                getFromEmail(),

            to: [
                email,
            ],

            subject:
                "Ecommerce Password Reset OTP",

            html: `
                <div style="
                    font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: auto;
                    padding: 20px;
                ">

                    <h2>
                        Password Reset
                    </h2>

                    <p>
                        We received a request to reset
                        your Ecommerce account password.
                    </p>

                    <p>
                        Your OTP is:
                    </p>

                    <div style="
                        font-size: 32px;
                        font-weight: bold;
                        letter-spacing: 8px;
                        padding: 15px;
                        background: #f5f5f5;
                        text-align: center;
                        border-radius: 8px;
                    ">
                        ${otp}
                    </div>

                    <p>
                        This OTP will expire in 10 minutes.
                    </p>

                    <p>
                        If you did not request a password
                        reset, you can safely ignore this email.
                    </p>

                </div>
            `,

            text:
                `We received a request to reset your Ecommerce account password.

Your OTP is: ${otp}

This OTP will expire in 10 minutes.

If you did not request a password reset,
you can safely ignore this email.`,
        });

        if (error) {

            console.error(
                "❌ OTP EMAIL FAILED:",
                error,
            );

            throw new Error(
                error.message ||
                "Unable to send OTP email",
            );
        }

        console.log(
            "✅ OTP EMAIL SENT",
        );

        console.log(
            "Message ID:",
            data?.id,
        );

        return data;

    } catch (error) {

        console.error(
            "❌ OTP EMAIL FAILED",
        );

        console.error(
            error,
        );

        throw new Error(
            "Unable to send OTP email",
        );
    }
};

// =========================================
// FORGOT EMAIL / ACCOUNT RECOVERY OTP
// =========================================

export const sendForgotEmailOTP = async (
    email: string,
    otp: string,
) => {

    console.log(
        "📨 Sending account recovery OTP",
    );

    console.log(
        "To:",
        email,
    );

    try {

        const {
            data,
            error,
        } = await resend.emails.send({

            from:
                getFromEmail(),

            to: [
                email,
            ],

            subject:
                "Ecommerce Account Recovery OTP",

            html: `
                <div style="
                    font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: auto;
                    padding: 20px;
                ">

                    <h2>
                        Account Recovery
                    </h2>

                    <p>
                        We received a request to find
                        your Ecommerce account email.
                    </p>

                    <p>
                        Your verification OTP is:
                    </p>

                    <div style="
                        font-size: 32px;
                        font-weight: bold;
                        letter-spacing: 8px;
                        padding: 15px;
                        background: #f5f5f5;
                        text-align: center;
                        border-radius: 8px;
                    ">
                        ${otp}
                    </div>

                    <p>
                        This OTP will expire in 10 minutes.
                    </p>

                    <p>
                        If you did not request account
                        recovery, you can safely ignore
                        this email.
                    </p>

                </div>
            `,

            text:
                `We received a request to find your Ecommerce account email.

Your verification OTP is: ${otp}

This OTP will expire in 10 minutes.

If you did not request account recovery,
you can safely ignore this email.`,
        });

        if (error) {

            console.error(
                "❌ ACCOUNT RECOVERY EMAIL FAILED:",
                error,
            );

            throw new Error(
                error.message ||
                "Unable to send account recovery OTP",
            );
        }

        console.log(
            "✅ ACCOUNT RECOVERY OTP SENT",
        );

        console.log(
            "Message ID:",
            data?.id,
        );

        return data;

    } catch (error) {

        console.error(
            "❌ ACCOUNT RECOVERY EMAIL FAILED",
        );

        console.error(
            error,
        );

        throw new Error(
            "Unable to send account recovery OTP",
        );
    }
};