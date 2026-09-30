import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { commission, allocate, paise } from "../src/modules/payout/payout.money.js";
import { bankInput, encryptBankValue, decryptBankValue, verifyWebhookSignature } from "../src/modules/payout/payout.security.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixture-jwt-secret-only";
process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
process.env.RAZORPAY_KEY_SECRET = "fixture-only";
process.env.SELLER_BANK_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.MARKETPLACE_COMMISSION_PERCENT = "10";
process.env.SELLER_SETTLEMENT_HOLD_DAYS = "0";
process.env.SELLER_PAYOUT_MINIMUM_PAISE = "100";
process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "false";
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: "finance-fixture", client_email: "test@finance-fixture.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const { default: Order } = await import("../src/modules/orders/order.model.js");
const { default: Product } = await import("../src/modules/products/product.model.js");
const { default: Notification } = await import("../src/notifications/notification.model.js");
const { default: Earning, SellerEarningEvent, SellerFinanceLock } = await import("../src/modules/seller/sellerEarning.model.js");
const { default: Account } = await import("../src/modules/seller/sellerPayoutAccount.model.js");
const { default: Payout } = await import("../src/modules/payout/payout.model.js");
const { OrderService } = await import("../src/modules/orders/order.service.js");
const { PaymentService } = await import("../src/modules/payment/payment.service.js");
const { confirmCapturedPayment, recordPaymentFailure } = await import("../src/modules/payment/payment-lifecycle.js");
const { EarningService } = await import("../src/modules/payout/earning.service.js");
const { PayoutService } = await import("../src/modules/payout/payout.service.js");
const { PayoutAccountService, payoutProvider } = await import("../src/modules/payout/payout-account.service.js");
const { SellerService } = await import("../src/modules/seller/seller.service.js");
const { FirebaseMessagingService } = await import("../src/modules/notifications/firebaseMessaging.service.js");
const { default: razorpay } = await import("../src/modules/payment/razorpay.js");
FirebaseMessagingService.sendToUser = async () => { };
const seller = new mongoose.Types.ObjectId();
const buyer = new mongoose.Types.ObjectId();
const bank = { accountHolderName: "Fixture Seller", accountNumber: "123456789012", confirmAccountNumber: "123456789012", ifsc: "HDFC0000001", bankName: "Fixture Bank", accountType: "SAVINGS" as const };
let refundCalls = 0;
PaymentService.refundPayment = async (request, _payment, amount) => { refundCalls++; return { id: `rfnd_${request}`, status: "processed", amount: Math.round(amount * 100) }; };

before(async () => {
    // Hard-coded isolated localhost fixture database: never load MONGO_URI or touch production.
    const setup = await mongoose.createConnection("mongodb://127.0.0.1:27119/admin?directConnection=true", { serverSelectionTimeoutMS: 5000 }).asPromise();
    try { await setup.db!.admin().command({ replSetInitiate: { _id: "financeTest", members: [{ _id: 0, host: "127.0.0.1:27119" }] } }); }
    catch (error) { if ((error as { code?: number }).code !== 23) throw error; }
    await setup.close();
    await mongoose.connect(`mongodb://127.0.0.1:27119/finance_fixture_${process.pid}?replicaSet=financeTest`, { serverSelectionTimeoutMS: 20000 });
    await Promise.all([Order.init(), Product.init(), Notification.init(), Earning.init(), SellerEarningEvent.init(), SellerFinanceLock.init(), Account.init(), Payout.init()]);
    await SellerFinanceLock.create({ _id: seller });
});
after(async () => { await mongoose.disconnect(); });

async function fixture(overrides: Record<string, unknown> = {}) {
    const product = await Product.create({
        name: "Fixture", slug: `fixture-${crypto.randomUUID()}`, sku: crypto.randomUUID(), description: "Fixture product", price: 100, discountPrice: 100, stock: 8,
        seller, category: new mongoose.Types.ObjectId(), subcategory: new mongoose.Types.ObjectId(), brand: new mongoose.Types.ObjectId(), images: [], thumbnail: "https://example.com/image.png"
    });
    const order = await Order.create({
        user: buyer, items: [{ product: product._id, seller, name: "Fixture", image: "", basePrice: 100, discountPrice: 100, price: 100, quantity: 2, fulfilmentStatus: "pending" }],
        shippingAddress: { fullName: "Buyer", phone: "9999999999", pincode: "444001", house: "1", area: "Market", city: "Akola", state: "Maharashtra", country: "India" },
        subtotal: 200, total: 200, shippingCharge: 0, discount: 0, tax: 0, paymentMethod: "ONLINE", paymentStatus: "pending",
        orderStatus: "pending", paymentRetryEnabled: true, settlementEnabled: true, razorpayOrderId: `order_${new mongoose.Types.ObjectId()}`, ...overrides
    });
    return { order, product };
}

test("integer money, commission and allocations conserve paise", () => {
    assert.equal(paise(270.01), 27001); assert.equal(commission(27001, 1000), 2700);
    for (let amount = 0; amount < 100; amount++) assert.equal(allocate(amount, [13, 27, 60]).reduce((a, b) => a + b, 0), amount);
    assert.throws(() => paise(-1)); assert.throws(() => commission(100, 10001));
});
test("bank encryption authenticates ciphertext and validates matching account details", () => {
    const value = encryptBankValue(bank.accountNumber);
    assert.equal(decryptBankValue(value), bank.accountNumber); assert.ok(!value.includes(bank.accountNumber));
    assert.throws(() => decryptBankValue(value.slice(0, -2) + (value.endsWith("ff") ? "00" : "ff")));
    assert.equal(bankInput.safeParse({ ...bank, confirmAccountNumber: "999999999" }).success, false);
    assert.equal(bankInput.safeParse({ ...bank, ifsc: "BAD" }).success, false);
    assert.equal(verifyWebhookSignature(Buffer.from("{}"), "bad", "test"), false);
});
test("duplicate failure/retry keeps the original deadline and never reserves stock twice", async () => {
    const { order, product } = await fixture();
    await recordPaymentFailure(String(order._id), "failed-1");
    const first = await Order.findById(order._id);
    razorpay.orders.fetch = async () => ({ id: order.razorpayOrderId!, amount: 20000, currency: "INR", status: "attempted" }) as never;
    await PaymentService.createPayment(String(order._id), String(buyer));
    await recordPaymentFailure(String(order._id), "failed-2");
    const latest = await Order.findById(order._id);
    assert.equal(latest!.paymentRetryExpiresAt!.getTime(), first!.paymentRetryExpiresAt!.getTime());
    assert.equal(latest!.paymentAttemptCount, 1); assert.equal((await Product.findById(product._id))!.stock, 8);
    await confirmCapturedPayment(String(order._id), "pay_retry");
    await recordPaymentFailure(String(order._id), "failed-late");
    assert.equal((await Order.findById(order._id))!.paymentStatus, "success");
});
test("concurrent expiry restores stock once, and does not expire legacy orders", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    await Promise.all([OrderService.expirePaymentOrder(String(order._id)), OrderService.expirePaymentOrder(String(order._id))]);
    assert.equal((await Product.findById(product._id))!.stock, 10);
    assert.equal((await Order.findById(order._id))!.orderStatus, "cancelled");
    assert.equal(await Notification.countDocuments({ dedupeKey: `payment-expired:${order._id}` }), 1);
    const legacy = await fixture({ paymentRetryEnabled: false, createdAt: new Date(0) });
    await OrderService.expirePaymentOrder(String(legacy.order._id));
    assert.equal((await Order.findById(legacy.order._id))!.orderStatus, "pending");
});
test("abandoned checkout expiry and late capture refund keep sellers hidden", async () => {
    const { order, product } = await fixture({ createdAt: new Date(Date.now() - 16 * 60_000) });
    await OrderService.expirePaymentOrder(String(order._id));
    const calls = refundCalls;
    await confirmCapturedPayment(String(order._id), "pay_late");
    const latest = await Order.findById(order._id);
    assert.equal(latest!.sellerReleasedAt, null); assert.equal(latest!.refundStatus, "processed");
    assert.equal(refundCalls, calls + 1); assert.equal((await Product.findById(product._id))!.stock, 10);
    assert.equal(await SellerService.getOrder(String(seller), String(order._id)), null);
});
test("concurrent confirmations enqueue exactly one seller notification and one earning", async () => {
    const { order } = await fixture();
    await Promise.all([confirmCapturedPayment(String(order._id), "pay_same", "capture-1"), confirmCapturedPayment(String(order._id), "pay_same", "capture-2")]);
    assert.equal(await Notification.countDocuments({ dedupeKey: `new-order:${order._id}:${seller}` }), 1);
    assert.equal(await Earning.countDocuments({ order: order._id, kind: "SALE" }), 1);
    assert.ok(await SellerService.getOrder(String(seller), String(order._id)));
});
test("bank responses are masked, disabled provider never fakes verification or payout", async () => {
    const account = await PayoutAccountService.save(String(seller), bank);
    assert.ok(account); assert.equal(account!.accountNumberLast4, "9012");
    assert.ok(!JSON.stringify(account).includes(bank.accountNumber));
    assert.equal((await PayoutAccountService.verify(String(seller)))!.verificationStatus, "UNVERIFIED");
    await assert.rejects(PayoutService.reserve(String(seller)), /disabled/);
});
test("payout reservation, duplicate provider events, post-payout refund debt, failure release and account snapshot", async () => {
    const { order } = await fixture({ orderStatus: "delivered", deliveredAt: new Date(Date.now() - 1000) });
    await confirmCapturedPayment(String(order._id), "pay_settlement");
    process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "true";
    payoutProvider.configured = () => true;
    await Account.updateOne({ seller }, { $set: { verificationStatus: "VERIFIED", providerFundAccountId: "fa_fixture" } });
    process.env.RAZORPAYX_ACCOUNT_NUMBER = "fixture-source";
    const ids = await Promise.all([PayoutService.reserve(String(seller)), PayoutService.reserve(String(seller))]);
    assert.equal(ids.filter(Boolean).length, 1);
    const payout = (await Payout.findById(ids.find(Boolean)))!;
    assert.equal(payout.amount, 18000);
    const response = { id: "pout_fixture", amount: payout.amount, currency: "INR", status: "processed", fund_account_id: "fa_fixture", reference_id: payout.providerReferenceId };
    await Promise.all([PayoutService.applyProviderStatus(payout.providerReferenceId, response, "test", "event-1"), PayoutService.applyProviderStatus(payout.providerReferenceId, response, "test", "event-1")]);
    assert.equal((await Earning.findOne({ order: order._id, kind: "SALE" }))!.status, "PAID");
    await Order.updateOne({ _id: order._id }, { $set: { "items.0.cancelledQuantity": 1 } });
    await EarningService.reconcileOrder(String(order._id)); await EarningService.reconcileOrder(String(order._id));
    assert.equal(await Earning.countDocuments({ order: order._id, kind: "ADJUSTMENT" }), 1);
    assert.equal((await Earning.findOne({ order: order._id, kind: "ADJUSTMENT" }))!.netAmount, -9000);
    assert.equal((await Payout.findById(payout._id))!.amount, 18000);
    await PayoutAccountService.save(String(seller), { ...bank, accountNumber: "123456789999", confirmAccountNumber: "123456789999" });
    assert.equal((await Payout.findById(payout._id))!.accountSnapshot!.accountNumberLast4, "9012");
    await PayoutService.applyProviderStatus(payout.providerReferenceId, { ...response, status: "reversed" }, "test", "event-reverse");
    assert.equal((await Earning.findOne({ order: order._id, kind: "SALE" }))!.status, "AVAILABLE");
    await EarningService.reconcileOrder(String(order._id));
    const rows = await Earning.find({ order: order._id, status: "AVAILABLE" });
    assert.equal(rows.reduce((sum, row) => sum + row.netAmount, 0), 9000);
    process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "false";
});

test("partial cancellation expiry restores only remaining variant quantities", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    product.variants = [{ sku: "fixture-size", price: 100, stock: 8, sizes: [{ size: "M", stock: 8 }] }] as typeof product.variants;
    await product.save();
    await Order.updateOne({ _id: order._id }, {
        $set: {
            orderStatus: "partially_cancelled", "items.0.cancelledQuantity": 1,
            "items.0.variant": { sku: "fixture-size", optionType: "size", optionValue: "M" }
        }
    });
    await OrderService.expirePaymentOrder(String(order._id));
    await OrderService.expirePaymentOrder(String(order._id));
    assert.equal((await Product.findById(product._id))!.variants[0].sizes![0].stock, 9);
});

test("capture racing expiry preserves inventory and either releases or refunds", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    await Promise.all([OrderService.expirePaymentOrder(String(order._id)), confirmCapturedPayment(String(order._id), "pay_race")]);
    const latest = (await Order.findById(order._id))!;
    const stock = (await Product.findById(product._id))!.stock;
    assert.equal(latest.paymentStatus, "success");
    if (latest.orderStatus === "cancelled") { assert.equal(stock, 10); assert.equal(latest.sellerReleasedAt, null); assert.equal(latest.refundStatus, "processed"); }
    else { assert.equal(stock, 8); assert.ok(latest.sellerReleasedAt); }
});

test("webhook before verify and simultaneous verify/capture do not duplicate earnings", async () => {
    const { order } = await fixture();
    const paymentId = "pay_verify";
    razorpay.payments.fetch = async () => ({ id: paymentId, status: "captured", order_id: order.razorpayOrderId!, amount: 20000, currency: "INR" }) as never;
    const data = {
        razorpay_order_id: order.razorpayOrderId!, razorpay_payment_id: paymentId,
        razorpay_signature: crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${order.razorpayOrderId}|${paymentId}`).digest("hex")
    };
    await confirmCapturedPayment(String(order._id), paymentId, "before-verify");
    await Promise.all([PaymentService.verifyPayment(data, String(buyer)), confirmCapturedPayment(String(order._id), paymentId, "duplicate-capture")]);
    assert.equal(await Notification.countDocuments({ dedupeKey: `new-order:${order._id}:${seller}` }), 1);
    assert.equal(await Earning.countDocuments({ order: order._id }), 1);
});

test("unpaid seller endpoints reject access, COD releases immediately but never becomes a bank earning", async () => {
    const unpaid = await fixture();
    assert.equal(await SellerService.getOrder(String(seller), String(unpaid.order._id)), null);
    assert.equal(await SellerService.updateOrderStatus(String(seller), String(unpaid.order._id), "shipped"), null);
    assert.equal(await SellerService.markOrderShippedAfterLabel(String(seller), String(unpaid.order._id)), null);
    const cod = await fixture({ paymentMethod: "COD", paymentRetryEnabled: false, sellerReleasedAt: new Date() });
    const { releaseSellerNotifications } = await import("../src/modules/payment/payment-lifecycle.js");
    await Promise.all([releaseSellerNotifications(String(cod.order._id)), releaseSellerNotifications(String(cod.order._id))]);
    assert.equal(await Notification.countDocuments({ dedupeKey: `new-order:${cod.order._id}:${seller}` }), 1);
    await SellerService.updateOrderStatus(String(seller), String(cod.order._id), "shipped");
    await SellerService.updateOrderStatus(String(seller), String(cod.order._id), "delivered");
    assert.equal((await Earning.findOne({ order: cod.order._id }))!.status, "MANUAL");
});

test("full cancellation before payout reverses earnings and never restores stock twice", async () => {
    const { order, product } = await fixture();
    await confirmCapturedPayment(String(order._id), "pay_cancel");
    await OrderService.cancelOrder(String(buyer), String(order._id));
    await assert.rejects(OrderService.cancelOrder(String(buyer), String(order._id)), /already cancelled/);
    await EarningService.reconcileOrder(String(order._id));
    const earning = (await Earning.findOne({ order: order._id }))!;
    assert.equal(earning.netAmount, 0); assert.equal(earning.status, "REVERSED");
    assert.equal((await Product.findById(product._id))!.stock, 10);
});

test("HTTP payout APIs enforce session role, seller ownership and raw webhook signatures", async () => {
    const { default: express } = await import("express");
    const { sellerFinanceRoutes, adminFinanceRoutes } = await import("../src/modules/payout/payout.routes.js");
    const { payoutWebhook } = await import("../src/modules/payout/payout.webhook.controller.js");
    const { default: User } = await import("../src/modules/users/user.model.js");
    const { generateAccessToken } = await import("../src/modules/auth/jwt.js");
    const stranger = new mongoose.Types.ObjectId();
    await User.collection.insertMany([
        {
            _id: seller,
            name: "Fixture seller",
            email: `seller-${seller.toString()}@fixture.test`,
            phone: "9000000001",
            role: "seller",
            isActive: true,
        },
        {
            _id: stranger,
            name: "Other",
            email: `seller-${stranger.toString()}@fixture.test`,
            phone: "9000000002",
            role: "seller",
            isActive: true,
        },
    ]); const app = express();
    app.post("/api/payout/webhook", express.raw({ type: "application/json" }), payoutWebhook);
    app.use(express.json()); app.use("/api/seller", sellerFinanceRoutes); app.use("/api/admin", adminFinanceRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const auth = (userId: string, role: string) => ({ Authorization: `Bearer ${generateAccessToken({ userId, role })}` });
    try {
        assert.equal((await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(seller), "customer") })).status, 403);
        assert.equal((await fetch(`${base}/api/admin/payouts/process`, { method: "POST", headers: auth(String(seller), "seller") })).status, 403);
        const other = await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(stranger), "seller") });
        assert.equal((await other.json()).data, null);
        const payout = (await Payout.findOne({ seller }))!;
        assert.equal((await fetch(`${base}/api/seller/payouts/${payout._id}`, { headers: auth(String(stranger), "seller") })).status, 400);
        const own = await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(seller), "seller") });
        const text = await own.text(); assert.ok(!text.includes("encryptedAccountNumber")); assert.ok(!text.includes("123456789999"));
        process.env.RAZORPAYX_WEBHOOK_SECRET = "fixture-webhook";
        assert.equal((await fetch(`${base}/api/payout/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": "bad" }, body: "{}" })).status, 400);
        const body = JSON.stringify({ event: "ignored.event", payload: {} });
        const signature = crypto.createHmac("sha256", "fixture-webhook").update(body).digest("hex");
        assert.equal((await fetch(`${base}/api/payout/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": signature }, body })).status, 200);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
test(
    "signed payment/refund HTTP webhooks reject bad signatures and remain idempotent",
    async () => {
        const { default: express } =
            await import("express");

        const {
            PaymentWebhookController,
        } = await import(
            "../src/modules/payment/payment.webhook.controller.js"
        );

        const { order } =
            await fixture();

        process.env.RAZORPAY_WEBHOOK_SECRET =
            "fixture-payment-webhook";

        const app =
            express();

        app.post(
            "/api/payment/webhook",
            express.raw({
                type:
                    "application/json",
            }),
            PaymentWebhookController.handle,
        );

        const server =
            app.listen(
                0,
                "127.0.0.1",
            );

        await new Promise<void>(
            resolve =>
                server.once(
                    "listening",
                    resolve,
                ),
        );

        const address =
            server.address() as {
                port: number;
            };

        const base =
            `http://127.0.0.1:${address.port}`;

        const sign = (
            body: string,
        ) =>
            crypto
                .createHmac(
                    "sha256",
                    process.env
                        .RAZORPAY_WEBHOOK_SECRET!,
                )
                .update(body)
                .digest("hex");

        try {
            const capturePayload =
                JSON.stringify({
                    event:
                        "payment.captured",

                    payload: {
                        payment: {
                            entity: {
                                id:
                                    "pay_http_capture",

                                order_id:
                                    order.razorpayOrderId,

                                status:
                                    "captured",

                                amount:
                                    20000,

                                currency:
                                    "INR",
                            },
                        },
                    },
                });

            const badResponse =
                await fetch(
                    `${base}/api/payment/webhook`,
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "x-razorpay-signature":
                                "bad",
                        },

                        body:
                            capturePayload,
                    },
                );

            assert.equal(
                badResponse.status,
                400,
            );

            assert.equal(
                (
                    await Order.findById(
                        order._id,
                    )
                )!.paymentStatus,
                "pending",
            );

            const validHeaders = {
                "Content-Type":
                    "application/json",

                "x-razorpay-signature":
                    sign(
                        capturePayload,
                    ),

                "x-razorpay-event-id":
                    "payment-http-event-1",
            };

            const firstCapture =
                await fetch(
                    `${base}/api/payment/webhook`,
                    {
                        method:
                            "POST",

                        headers:
                            validHeaders,

                        body:
                            capturePayload,
                    },
                );

            assert.equal(
                firstCapture.status,
                200,
            );

            const duplicateCapture =
                await fetch(
                    `${base}/api/payment/webhook`,
                    {
                        method:
                            "POST",

                        headers:
                            validHeaders,

                        body:
                            capturePayload,
                    },
                );

            assert.equal(
                duplicateCapture.status,
                200,
            );

            assert.equal(
                (
                    await Order.findById(
                        order._id,
                    )
                )!.paymentStatus,
                "success",
            );

            assert.equal(
                await Earning.countDocuments({
                    order:
                        order._id,

                    kind:
                        "SALE",
                }),
                1,
            );

            assert.equal(
                await Notification.countDocuments({
                    dedupeKey:
                        `new-order:${order._id}:${seller}`,
                }),
                1,
            );

            await OrderService.cancelOrder(
                String(buyer),
                String(order._id),
            );

            const cancelled =
                (
                    await Order.findById(
                        order._id,
                    )
                )!;

            const refunds =
                cancelled.refunds ?? [];

            assert.ok(
                refunds.length > 0,
                "Expected a refund record after cancellation",
            );

            const refundRecord =
                refunds.at(-1)!;
            const refundPayload =
                JSON.stringify({
                    event:
                        "refund.processed",

                    payload: {
                        refund: {
                            entity: {
                                id:
                                    refundRecord
                                        .razorpayRefundId,

                                payment_id:
                                    cancelled
                                        .razorpayPaymentId,

                                amount:
                                    Math.round(
                                        Number(
                                            refundRecord
                                                .amount,
                                        ) *
                                        100,
                                    ),

                                status:
                                    "processed",

                                receipt:
                                    refundRecord
                                        .requestId,

                                notes: {
                                    refund_request_id:
                                        refundRecord
                                            .requestId,
                                },
                            },
                        },
                    },
                });

            const refundHeaders = {
                "Content-Type":
                    "application/json",

                "x-razorpay-signature":
                    sign(
                        refundPayload,
                    ),

                "x-razorpay-event-id":
                    "refund-http-event-1",
            };

            const beforeRefunded =
                Number(
                    cancelled
                        .refundedAmount ||
                    0,
                );

            const firstRefund =
                await fetch(
                    `${base}/api/payment/webhook`,
                    {
                        method:
                            "POST",

                        headers:
                            refundHeaders,

                        body:
                            refundPayload,
                    },
                );

            assert.equal(
                firstRefund.status,
                200,
            );

            const duplicateRefund =
                await fetch(
                    `${base}/api/payment/webhook`,
                    {
                        method:
                            "POST",

                        headers:
                            refundHeaders,

                        body:
                            refundPayload,
                    },
                );

            assert.equal(
                duplicateRefund.status,
                200,
            );

            assert.equal(
                Number(
                    (
                        await Order.findById(
                            order._id,
                        )
                    )!
                        .refundedAmount ||
                    0,
                ),
                beforeRefunded,
            );

        } finally {
            await new Promise<void>(
                (
                    resolve,
                    reject,
                ) =>
                    server.close(
                        error =>
                            error
                                ? reject(
                                    error,
                                )
                                : resolve(),
                    ),
            );
        }
    },
);
test("RazorpayX adapter uses paise, a stable idempotency key and rejects test validation", async () => {
    const { RazorpayXProvider } = await import("../src/modules/payout/providers/razorpayX.provider.js");
    const adapter = new RazorpayXProvider();
    process.env.RAZORPAYX_KEY_ID = "rzp_test_fixture"; process.env.RAZORPAYX_KEY_SECRET = "fixture";
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async (url, options) => {
        called++;
        assert.equal(url, "https://api.razorpay.com/v1/payouts");
        assert.equal((options?.headers as Record<string, string>)["X-Payout-Idempotency"], "fixture-stable-key");
        const body = JSON.parse(String(options?.body)); assert.equal(body.amount, 12345);
        return new Response(JSON.stringify({ id: "pout_adapter", status: "queued", amount: 12345, currency: "INR", fund_account_id: "fa_fixture", reference_id: "fixture-stable-key" }));
    };
    try {
        await adapter.createPayout({ amount: 12345, fundAccountId: "fa_fixture", reference: "fixture-stable-key", sourceAccount: "fixture-source" });
        await assert.rejects(adapter.verifyBankAccount("fa_fixture"), /not enabled/);
        assert.equal(called, 1);
    } finally { globalThis.fetch = originalFetch; }
});
