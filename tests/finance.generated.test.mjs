import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { commission, allocate, paise, inclusiveGst, financeConfig } from "../dist/modules/payout/payout.money.js";
import { bankInput, encryptBankValue, decryptBankValue, verifyWebhookSignature } from "../dist/modules/payout/payout.security.js";
process.env.NODE_ENV = "test";
process.env.SINGLE_SELLER_MODE = "false";
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
const { default: Order } = await import("../dist/modules/orders/order.model.js");
const { default: Product } = await import("../dist/modules/products/product.model.js");
const { default: Notification } = await import("../dist/notifications/notification.model.js");
const { default: Earning, SellerEarningEvent, SellerFinanceLock } = await import("../dist/modules/seller/sellerEarning.model.js");
const { default: Account } = await import("../dist/modules/seller/sellerPayoutAccount.model.js");
const { default: Payout } = await import("../dist/modules/payout/payout.model.js");
const { OrderService } = await import("../dist/modules/orders/order.service.js");
const { PaymentService } = await import("../dist/modules/payment/payment.service.js");
const { confirmCapturedPayment, recordPaymentFailure } = await import("../dist/modules/payment/payment-lifecycle.js");
const { EarningService } = await import("../dist/modules/payout/earning.service.js");
const { PayoutService } = await import("../dist/modules/payout/payout.service.js");
const { PayoutAccountService, payoutProvider } = await import("../dist/modules/payout/payout-account.service.js");
const { SellerService } = await import("../dist/modules/seller/seller.service.js");
const { FirebaseMessagingService } = await import("../dist/modules/notifications/firebaseMessaging.service.js");
const { default: razorpay } = await import("../dist/modules/payment/razorpay.js");
FirebaseMessagingService.sendToUser = async () => { };
const seller = new mongoose.Types.ObjectId();
const buyer = new mongoose.Types.ObjectId();
const bank = { accountHolderName: "Fixture Seller", accountNumber: "123456789012", confirmAccountNumber: "123456789012", ifsc: "HDFC0000001", bankName: "Fixture Bank", accountType: "SAVINGS" };
let refundCalls = 0;
PaymentService.refundPayment = async (request, _payment, amount) => { refundCalls++; return { id: `rfnd_${request}`, status: "processed", amount: Math.round(amount * 100) }; };
before(async () => {
    // Hard-coded isolated localhost fixture database: never load MONGO_URI or touch production.
    const setup = await mongoose.createConnection("mongodb://127.0.0.1:27119/admin?directConnection=true", { serverSelectionTimeoutMS: 5000 }).asPromise();
    try {
        await setup.db.admin().command({ replSetInitiate: { _id: "financeTest", members: [{ _id: 0, host: "127.0.0.1:27119" }] } });
    }
    catch (error) {
        if (error.code !== 23)
            throw error;
    }
    await setup.close();
    await mongoose.connect(`mongodb://127.0.0.1:27119/finance_fixture_${process.pid}?replicaSet=financeTest`, { serverSelectionTimeoutMS: 20000 });
    await Promise.all([Order.init(), Product.init(), Notification.init(), Earning.init(), SellerEarningEvent.init(), SellerFinanceLock.init(), Account.init(), Payout.init()]);
    await SellerFinanceLock.create({ _id: seller });
});
after(async () => { await mongoose.disconnect(); });
async function fixture(overrides = {}) {
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
    assert.equal(paise(270.01), 27001);
    assert.equal(commission(27001, 1000), 2700);
    for (let amount = 0; amount < 100; amount++)
        assert.equal(allocate(amount, [13, 27, 60]).reduce((a, b) => a + b, 0), amount);
    assert.throws(() => paise(-1));
    assert.throws(() => commission(100, 10001));
});
test("inclusive GST rounds line amounts without guessing rates or unknown state splits", () => {
    assert.equal(inclusiveGst(800, 18).gstAmount, 122.03);
    const intra = inclusiveGst(800, 18, "Maharashtra", " Maharashtra ");
    assert.equal(paise(intra.cgstAmount) + paise(intra.sgstAmount), paise(intra.gstAmount));
    assert.equal(intra.igstAmount, 0);
    const inter = inclusiveGst(800, 18, "Karnataka", "Maharashtra");
    assert.equal(inter.igstAmount, inter.gstAmount);
    assert.equal(inter.cgstAmount, 0);
    assert.equal(inter.sgstAmount, 0);
    assert.deepEqual(inclusiveGst(800, undefined), { gstRate: null, gstAmount: null });
    assert.deepEqual(inclusiveGst(800, 0), { gstRate: 0, gstAmount: 0 });
    assert.equal(inclusiveGst(100, 0.25).gstAmount, 0.25);
    assert.equal(inclusiveGst(800, 18, "MH", "Maharashtra").cgstAmount, undefined);
    assert.throws(() => inclusiveGst(800, -1));
    assert.throws(() => inclusiveGst(800, 18.123));
});
test("checkout snapshots configured GST, ignores client totals, preserves delivery and paid-value refunds", async () => {
    const { createOrder } = await import("../dist/modules/orders/order.controller.js");
    const { default: User } = await import("../dist/modules/users/user.model.js");
    const gstSeller = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: gstSeller, email: `gst-${gstSeller}@fixture.test`, phone: "9000000099", business: { state: "Maharashtra" } });
    const checkout = async (selling, rate, quantity = 1) => {
        const { product, order: template } = await fixture();
        await Product.updateOne({ _id: product._id }, { $set: { seller: gstSeller, price: selling + 100, discountPrice: selling, hsnCode: "6109", gstRate: rate } }, { runValidators: true });
        let status = 200;
        let response;
        const res = { status(code) { status = code; return this; }, json(body) { response = body; return this; } };
        await createOrder({ user: { userId: String(buyer) }, body: { items: [{ product: String(product._id), quantity, price: 1, gstRate: 99 }], shippingAddress: template.shippingAddress, paymentMethod: "ONLINE", total: 1, tax: 999, shippingCharge: 999 } }, res);
        assert.equal(status, 201, response?.message);
        return { order: await Order.findById(response.data._id), product };
    };
    for (const [selling, delivery] of [[499.99, 30], [500, 0], [800, 0]]) {
        const { order } = await checkout(selling, 18);
        assert.equal(order.subtotal, selling);
        assert.equal(order.discount, 100);
        assert.equal(order.shippingCharge, delivery);
        assert.equal(order.total, selling + delivery);
        assert.equal(order.tax, order.gstAmount);
        assert.equal(order.gstAmount, inclusiveGst(selling, 18).gstAmount);
        assert.equal(order.gstDetailsComplete, true);
        assert.equal(paise(order.cgstAmount) + paise(order.sgstAmount), paise(order.gstAmount));
        assert.equal(order.igstAmount, 0);
    }
    await User.collection.updateOne({ _id: gstSeller }, { $unset: { "business.state": 1 } });
    const local = await checkout(118, 18);
    assert.equal(local.order.cgstAmount, 9);
    assert.equal(local.order.sgstAmount, 9);
    assert.equal(local.order.igstAmount, 0);
    await User.collection.updateOne({ _id: gstSeller }, { $set: { "business.state": "Karnataka" } });
    const interstate = await checkout(118, 18);
    assert.equal(interstate.order.cgstAmount, 0);
    assert.equal(interstate.order.sgstAmount, 0);
    assert.equal(interstate.order.igstAmount, 18);
    await User.collection.updateOne({ _id: gstSeller }, { $set: { "business.state": "Maharashtra" } });
    const { order, product } = await checkout(100, 18, 2);
    assert.equal(order.total, 230);
    assert.equal(order.gstAmount, 30.51);
    assert.equal(order.items[0].basePrice, 200);
    assert.equal(order.items[0].discountPrice, 100);
    assert.equal(order.items[0].price, 100);
    assert.equal(order.items[0].hsnCode, "6109");
    await Product.updateOne({ _id: product._id }, { $set: { gstRate: 5, hsnCode: "6110" } });
    assert.equal((await Order.findById(order._id)).items[0].gstRate, 18);
    await confirmCapturedPayment(String(order._id), "pay_gst_snapshot");
    const earning = await Earning.findOne({ order: order._id, kind: "SALE" });
    assert.equal(earning.grossAmount, 20000);
    assert.equal(earning.gstAmount, 3051);
    assert.equal(earning.netAmount, 18000);
    await OrderService.cancelOrderItem(String(buyer), String(order._id), 0);
    const cancelled = await Order.findById(order._id);
    assert.equal(cancelled.refundedAmount, 230); // Existing full-order refund includes delivery; GST is never added again.
    const reversed = await Earning.findById(earning._id);
    assert.equal(reversed.refundAmount, 20000);
    assert.equal(reversed.netAmount, 0); // Seller only funded merchandise.
    assert.equal(cancelled.items[0].gstAmount, 30.51);
    const missing = await checkout(100, null);
    assert.equal(missing.order.items[0].gstRate, null);
    assert.equal(missing.order.gstDetailsComplete, false);
    const legacy = await fixture({ tax: 7.5 });
    const legacyJson = legacy.order.toJSON();
    assert.equal(legacyJson.gstAmount ?? legacyJson.tax, 7.5);
    await assert.rejects(Product.updateOne({ _id: product._id }, { $set: { gstRate: 101 } }, { runValidators: true }));
    await assert.rejects(Product.updateOne({ _id: product._id }, { $set: { hsnCode: "BAD" } }, { runValidators: true }));
});
test("single-seller mode blocks payouts, keeps owner sales non-payable across mode changes and preserves COD/history", async () => {
    const { createOrder } = await import("../dist/modules/orders/order.controller.js");
    const { order: historical } = await fixture();
    await confirmCapturedPayment(String(historical._id), "pay_single_history");
    const historicalOrder = await Order.findById(historical._id).lean();
    const historicalEarning = await Earning.findOne({ order: historical._id }).lean();
    const originalConfigured = payoutProvider.configured;
    const originalCreate = payoutProvider.createPayout;
    let transferCalls = 0;
    payoutProvider.configured = () => true;
    payoutProvider.createPayout = async () => { transferCalls++; throw new Error("Unexpected owner transfer"); };
    process.env.SINGLE_SELLER_MODE = "true";
    process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "true"; // Single-seller mode must override this flag.
    const checkout = async (paymentMethod) => {
        const { product, order: template } = await fixture();
        let status = 200;
        let response;
        const res = { status(code) { status = code; return this; }, json(body) { response = body; return this; } };
        await createOrder({ user: { userId: String(buyer) }, body: { items: [{ product: String(product._id), quantity: 2 }], shippingAddress: template.shippingAddress, paymentMethod } }, res);
        assert.equal(status, 201, response?.message);
        return (await Order.findById(response.data._id));
    };
    try {
        assert.equal(financeConfig().bps, 0); // Even if MARKETPLACE_COMMISSION_PERCENT is still 10.
        const payoutCount = await Payout.countDocuments();
        await assert.rejects(PayoutService.reserve(String(seller)), /disabled/);
        await assert.rejects(PayoutService.submit(String(new mongoose.Types.ObjectId())), /disabled/);
        assert.deepEqual(await PayoutService.processEligibleSellerPayouts(), { enabled: false, processed: 0 });
        assert.equal(await Payout.countDocuments(), payoutCount);
        assert.equal(transferCalls, 0);
        await EarningService.reconcileOrder(String(historical._id));
        assert.deepEqual(await Order.findById(historical._id).lean(), historicalOrder);
        assert.deepEqual(await Earning.findOne({ order: historical._id }).lean(), historicalEarning);
        const summary = await EarningService.summary(String(seller));
        assert.equal(summary.available, 0);
        assert.equal(summary.balance, 0);
        assert.equal(summary.pendingSettlement, 0);
        const online = await checkout("ONLINE");
        assert.equal(online.settlementEnabled, true);
        assert.equal(online.sellerPayoutDisabled, true);
        assert.equal(online.total, 230);
        assert.equal(online.paymentRetryEnabled, true);
        assert.equal(online.sellerReleasedAt, null);
        await confirmCapturedPayment(String(online._id), "pay_single_owner");
        assert.equal((await Order.findById(online._id)).paymentStatus, "success");
        assert.ok(await SellerService.getOrder(String(seller), String(online._id)));
        assert.equal(await Earning.countDocuments({ order: online._id }), 0);
        await OrderService.cancelOrderItem(String(buyer), String(online._id), 0);
        assert.equal((await Order.findById(online._id)).refundedAmount, 230);
        const cod = await checkout("COD");
        assert.equal(cod.settlementEnabled, true);
        assert.equal(cod.sellerPayoutDisabled, false);
        assert.ok(cod.sellerReleasedAt);
        assert.equal(cod.paymentRetryEnabled, false);
        await Order.updateOne({ _id: cod._id }, { $set: { orderStatus: "delivered", deliveredAt: new Date() } });
        await EarningService.reconcileOrder(String(cod._id));
        const codEarning = await Earning.findOne({ order: cod._id });
        assert.equal(codEarning.status, "MANUAL");
        assert.equal(codEarning.settlementMode, "COD_COLLECTED_BY_SELLER");
        assert.equal(codEarning.commissionBps, 0);
        assert.equal(codEarning.netAmount, 20000);
        process.env.SINGLE_SELLER_MODE = "false";
        assert.equal(financeConfig().bps, 1000);
        await EarningService.reconcileOrder(String(online._id));
        assert.equal(await Earning.countDocuments({ order: online._id }), 0);
        const marketplace = await checkout("ONLINE");
        assert.equal(marketplace.settlementEnabled, true);
        assert.equal(marketplace.sellerPayoutDisabled, false);
        await confirmCapturedPayment(String(marketplace._id), "pay_marketplace_resumed");
        assert.equal((await Earning.findOne({ order: marketplace._id })).commissionBps, 1000);
    }
    finally {
        process.env.SINGLE_SELLER_MODE = "false";
        process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "false";
        payoutProvider.configured = originalConfigured;
        payoutProvider.createPayout = originalCreate;
    }
});
test("bank encryption authenticates ciphertext and validates matching account details", () => {
    const value = encryptBankValue(bank.accountNumber);
    assert.equal(decryptBankValue(value), bank.accountNumber);
    assert.ok(!value.includes(bank.accountNumber));
    assert.throws(() => decryptBankValue(value.slice(0, -2) + (value.endsWith("ff") ? "00" : "ff")));
    assert.equal(bankInput.safeParse({ ...bank, confirmAccountNumber: "999999999" }).success, false);
    assert.equal(bankInput.safeParse({ ...bank, ifsc: "BAD" }).success, false);
    assert.equal(verifyWebhookSignature(Buffer.from("{}"), "bad", "test"), false);
});
test("duplicate failure/retry keeps the original deadline and never reserves stock twice", async () => {
    const { order, product } = await fixture();
    await recordPaymentFailure(String(order._id), "failed-1");
    const first = await Order.findById(order._id);
    razorpay.orders.fetch = async () => ({ id: order.razorpayOrderId, amount: 20000, currency: "INR", status: "attempted" });
    await PaymentService.createPayment(String(order._id), String(buyer));
    await recordPaymentFailure(String(order._id), "failed-2");
    const latest = await Order.findById(order._id);
    assert.equal(latest.paymentRetryExpiresAt.getTime(), first.paymentRetryExpiresAt.getTime());
    assert.equal(latest.paymentAttemptCount, 1);
    assert.equal((await Product.findById(product._id)).stock, 8);
    await confirmCapturedPayment(String(order._id), "pay_retry");
    await recordPaymentFailure(String(order._id), "failed-late");
    assert.equal((await Order.findById(order._id)).paymentStatus, "success");
});
test("concurrent expiry restores stock once, and does not expire legacy orders", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    await Promise.all([OrderService.expirePaymentOrder(String(order._id)), OrderService.expirePaymentOrder(String(order._id))]);
    assert.equal((await Product.findById(product._id)).stock, 10);
    assert.equal((await Order.findById(order._id)).orderStatus, "cancelled");
    assert.equal(await Notification.countDocuments({ dedupeKey: `payment-expired:${order._id}` }), 1);
    const legacy = await fixture({ paymentRetryEnabled: false, createdAt: new Date(0) });
    await OrderService.expirePaymentOrder(String(legacy.order._id));
    assert.equal((await Order.findById(legacy.order._id)).orderStatus, "pending");
});
test("abandoned checkout expiry and late capture refund keep sellers hidden", async () => {
    const { order, product } = await fixture({ createdAt: new Date(Date.now() - 16 * 60_000) });
    await OrderService.expirePaymentOrder(String(order._id));
    const calls = refundCalls;
    await confirmCapturedPayment(String(order._id), "pay_late");
    const latest = await Order.findById(order._id);
    assert.equal(latest.sellerReleasedAt, null);
    assert.equal(latest.refundStatus, "processed");
    assert.equal(refundCalls, calls + 1);
    assert.equal((await Product.findById(product._id)).stock, 10);
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
    assert.ok(account);
    assert.equal(account.accountNumberLast4, "9012");
    assert.ok(!JSON.stringify(account).includes(bank.accountNumber));
    assert.equal((await PayoutAccountService.verify(String(seller))).verificationStatus, "UNVERIFIED");
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
    const payout = (await Payout.findById(ids.find(Boolean)));
    assert.equal(payout.amount, 18000);
    const response = { id: "pout_fixture", amount: payout.amount, currency: "INR", status: "processed", fund_account_id: "fa_fixture", reference_id: payout.providerReferenceId };
    await Promise.all([PayoutService.applyProviderStatus(payout.providerReferenceId, response, "test", "event-1"), PayoutService.applyProviderStatus(payout.providerReferenceId, response, "test", "event-1")]);
    assert.equal((await Earning.findOne({ order: order._id, kind: "SALE" })).status, "PAID");
    const beforeRefundSummary = await EarningService.summary(String(seller));
    await Order.updateOne({ _id: order._id }, { $set: { "items.0.cancelledQuantity": 1 } });
    await EarningService.reconcileOrder(String(order._id));
    await EarningService.reconcileOrder(String(order._id));
    assert.equal(await Earning.countDocuments({ order: order._id, kind: "ADJUSTMENT" }), 1);
    assert.equal((await Earning.findOne({ order: order._id, kind: "ADJUSTMENT" })).netAmount, -9000);
    assert.equal((await EarningService.summary(String(seller))).refunded - beforeRefundSummary.refunded, 10000);
    assert.equal((await Payout.findById(payout._id)).amount, 18000);
    await PayoutAccountService.save(String(seller), { ...bank, accountNumber: "123456789999", confirmAccountNumber: "123456789999" });
    assert.equal((await Payout.findById(payout._id)).accountSnapshot.accountNumberLast4, "9012");
    await PayoutService.applyProviderStatus(payout.providerReferenceId, { ...response, status: "reversed" }, "test", "event-reverse");
    assert.equal((await Earning.findOne({ order: order._id, kind: "SALE" })).status, "AVAILABLE");
    await EarningService.reconcileOrder(String(order._id));
    const rows = await Earning.find({ order: order._id, status: "AVAILABLE" });
    assert.equal(rows.reduce((sum, row) => sum + row.netAmount, 0), 9000);
    process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "false";
});
test("held unsent payouts release safely and ambiguous submissions reuse the exact transfer request", async () => {
    const otherSeller = new mongoose.Types.ObjectId();
    const { order } = await fixture({ orderStatus: "delivered", deliveredAt: new Date(Date.now() - 1000) });
    await Order.updateOne({ _id: order._id }, { $set: { "items.0.seller": otherSeller } });
    await confirmCapturedPayment(String(order._id), "pay_ambiguous");
    await PayoutAccountService.save(String(otherSeller), bank);
    await Account.updateOne({ seller: otherSeller }, { $set: { verificationStatus: "VERIFIED", providerFundAccountId: "fa_ambiguous" } });
    const originalCreate = payoutProvider.createPayout;
    const originalConfigured = payoutProvider.configured;
    const requests = [];
    payoutProvider.configured = () => true;
    process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "true";
    process.env.RAZORPAYX_ACCOUNT_NUMBER = "fixture-source";
    payoutProvider.createPayout = async (input) => {
        requests.push(input);
        if (requests.length === 1)
            throw new Error("Fixture timeout after provider accepted transfer");
        return { id: "pout_ambiguous", amount: input.amount, currency: "INR", status: "processed", fund_account_id: input.fundAccountId, reference_id: input.reference };
    };
    try {
        const heldId = (await PayoutService.reserve(String(otherSeller)));
        await Account.updateOne({ seller: otherSeller }, { $set: { payoutHeld: true } });
        await PayoutService.submit(heldId);
        assert.equal(requests.length, 0);
        assert.equal((await Payout.findById(heldId)).status, "FAILED");
        await Account.updateOne({ seller: otherSeller }, { $set: { payoutHeld: false } });
        const payoutId = (await PayoutService.reserve(String(otherSeller)));
        await assert.rejects(PayoutService.submit(payoutId), /timeout/);
        assert.equal((await Earning.findOne({ order: order._id })).status, "PAYOUT_PENDING");
        assert.equal(await PayoutService.reserve(String(otherSeller)), undefined);
        await PayoutService.submit(payoutId);
        assert.deepEqual(requests[0], requests[1]);
        assert.equal((await Payout.findById(payoutId)).status, "PROCESSED");
        assert.equal((await Earning.findOne({ order: order._id })).status, "PAID");
    }
    finally {
        payoutProvider.createPayout = originalCreate;
        payoutProvider.configured = originalConfigured;
        process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = "false";
    }
});
test("legacy refund events with different IDs cannot double-count or downgrade a processed refund", async () => {
    const { PaymentWebhookController } = await import("../dist/modules/payment/payment.webhook.controller.js");
    process.env.RAZORPAY_WEBHOOK_SECRET = "fixture-webhook-only";
    const { order } = await fixture({ paymentStatus: "success", razorpayPaymentId: "pay_legacy_refund", refundId: "rfnd_legacy", refundStatus: "pending" });
    for (const [index, status] of ["processed", "processed", "failed"].entries()) {
        const body = Buffer.from(JSON.stringify({ event: `refund.${status}`, payload: { refund: { entity: { id: "rfnd_legacy", payment_id: "pay_legacy_refund", amount: 10000, status } } } }));
        let code = 200;
        const response = { status(value) { code = value; return this; }, json() { return this; } };
        await PaymentWebhookController.handle({ body, headers: { "x-razorpay-signature": crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex"), "x-razorpay-event-id": `legacy-${index}` } }, response);
        assert.equal(code, 200);
    }
    const latest = await Order.findById(order._id);
    assert.equal(latest.refundedAmount, 100);
    assert.equal(latest.refundStatus, "processed");
});
test("partial cancellation expiry restores only remaining variant quantities", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    product.variants = [{ sku: "fixture-size", price: 100, stock: 8, sizes: [{ size: "M", stock: 8 }] }];
    await product.save();
    await Order.updateOne({ _id: order._id }, {
        $set: {
            orderStatus: "partially_cancelled", "items.0.cancelledQuantity": 1,
            "items.0.variant": { sku: "fixture-size", optionType: "size", optionValue: "M" }
        }
    });
    await OrderService.expirePaymentOrder(String(order._id));
    await OrderService.expirePaymentOrder(String(order._id));
    assert.equal((await Product.findById(product._id)).variants[0].sizes[0].stock, 9);
});
test("capture racing expiry preserves inventory and either releases or refunds", async () => {
    const { order, product } = await fixture({ paymentRetryExpiresAt: new Date(Date.now() - 1000) });
    await Promise.all([OrderService.expirePaymentOrder(String(order._id)), confirmCapturedPayment(String(order._id), "pay_race")]);
    const latest = (await Order.findById(order._id));
    const stock = (await Product.findById(product._id)).stock;
    assert.equal(latest.paymentStatus, "success");
    if (latest.orderStatus === "cancelled") {
        assert.equal(stock, 10);
        assert.equal(latest.sellerReleasedAt, null);
        assert.equal(latest.refundStatus, "processed");
    }
    else {
        assert.equal(stock, 8);
        assert.ok(latest.sellerReleasedAt);
    }
});
test("webhook before verify and simultaneous verify/capture do not duplicate earnings", async () => {
    const { order } = await fixture();
    const paymentId = "pay_verify";
    razorpay.payments.fetch = async () => ({ id: paymentId, status: "captured", order_id: order.razorpayOrderId, amount: 20000, currency: "INR" });
    const data = {
        razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: paymentId,
        razorpay_signature: crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${order.razorpayOrderId}|${paymentId}`).digest("hex")
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
    const { releaseSellerNotifications } = await import("../dist/modules/payment/payment-lifecycle.js");
    await Promise.all([releaseSellerNotifications(String(cod.order._id)), releaseSellerNotifications(String(cod.order._id))]);
    assert.equal(await Notification.countDocuments({ dedupeKey: `new-order:${cod.order._id}:${seller}` }), 1);
    await SellerService.updateOrderStatus(String(seller), String(cod.order._id), "shipped");
    await SellerService.updateOrderStatus(String(seller), String(cod.order._id), "delivered");
    assert.equal((await Earning.findOne({ order: cod.order._id })).status, "MANUAL");
});
test("full cancellation before payout reverses earnings and never restores stock twice", async () => {
    const { order, product } = await fixture();
    await confirmCapturedPayment(String(order._id), "pay_cancel");
    await OrderService.cancelOrder(String(buyer), String(order._id));
    await assert.rejects(OrderService.cancelOrder(String(buyer), String(order._id)), /already cancelled/);
    await EarningService.reconcileOrder(String(order._id));
    const earning = (await Earning.findOne({ order: order._id }));
    assert.equal(earning.netAmount, 0);
    assert.equal(earning.status, "REVERSED");
    assert.equal((await Product.findById(product._id)).stock, 10);
});
test("HTTP payout APIs enforce session role, seller ownership and raw webhook signatures", async () => {
    const { default: express } = await import("express");
    const { sellerFinanceRoutes, adminFinanceRoutes } = await import("../dist/modules/payout/payout.routes.js");
    const { payoutWebhook } = await import("../dist/modules/payout/payout.webhook.controller.js");
    const { default: User } = await import("../dist/modules/users/user.model.js");
    const { generateAccessToken } = await import("../dist/modules/auth/jwt.js");
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
    ]);
    const app = express();
    app.post("/api/payout/webhook", express.raw({ type: "application/json" }), payoutWebhook);
    app.use(express.json());
    app.use("/api/seller", sellerFinanceRoutes);
    app.use("/api/admin", adminFinanceRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const auth = (userId, role) => ({ Authorization: `Bearer ${generateAccessToken({ userId, role })}` });
    try {
        assert.equal((await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(seller), "customer") })).status, 403);
        assert.equal((await fetch(`${base}/api/admin/payouts/process`, { method: "POST", headers: auth(String(seller), "seller") })).status, 403);
        const other = await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(stranger), "seller") });
        assert.equal((await other.json()).data, null);
        const payout = (await Payout.findOne({ seller }));
        assert.equal((await fetch(`${base}/api/seller/payouts/${payout._id}`, { headers: auth(String(stranger), "seller") })).status, 400);
        const own = await fetch(`${base}/api/seller/payout-account`, { headers: auth(String(seller), "seller") });
        const text = await own.text();
        assert.ok(!text.includes("encryptedAccountNumber"));
        assert.ok(!text.includes("123456789999"));
        process.env.RAZORPAYX_WEBHOOK_SECRET = "fixture-webhook";
        assert.equal((await fetch(`${base}/api/payout/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": "bad" }, body: "{}" })).status, 400);
        const body = JSON.stringify({ event: "ignored.event", payload: {} });
        const signature = crypto.createHmac("sha256", "fixture-webhook").update(body).digest("hex");
        assert.equal((await fetch(`${base}/api/payout/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": signature }, body })).status, 200);
    }
    finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
test("signed payment/refund HTTP webhooks reject bad signatures and remain idempotent", async () => {
    const { default: express } = await import("express");
    const { PaymentWebhookController, } = await import("../dist/modules/payment/payment.webhook.controller.js");
    const { order } = await fixture();
    process.env.RAZORPAY_WEBHOOK_SECRET =
        "fixture-payment-webhook";
    const app = express();
    app.post("/api/payment/webhook", express.raw({
        type: "application/json",
    }), PaymentWebhookController.handle);
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const sign = (body) => crypto
        .createHmac("sha256", process.env
        .RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");
    try {
        const capturePayload = JSON.stringify({
            event: "payment.captured",
            payload: {
                payment: {
                    entity: {
                        id: "pay_http_capture",
                        order_id: order.razorpayOrderId,
                        status: "captured",
                        amount: 20000,
                        currency: "INR",
                    },
                },
            },
        });
        const badResponse = await fetch(`${base}/api/payment/webhook`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-razorpay-signature": "bad",
            },
            body: capturePayload,
        });
        assert.equal(badResponse.status, 400);
        assert.equal((await Order.findById(order._id)).paymentStatus, "pending");
        const validHeaders = {
            "Content-Type": "application/json",
            "x-razorpay-signature": sign(capturePayload),
            "x-razorpay-event-id": "payment-http-event-1",
        };
        const firstCapture = await fetch(`${base}/api/payment/webhook`, {
            method: "POST",
            headers: validHeaders,
            body: capturePayload,
        });
        assert.equal(firstCapture.status, 200);
        const duplicateCapture = await fetch(`${base}/api/payment/webhook`, {
            method: "POST",
            headers: validHeaders,
            body: capturePayload,
        });
        assert.equal(duplicateCapture.status, 200);
        assert.equal((await Order.findById(order._id)).paymentStatus, "success");
        assert.equal(await Earning.countDocuments({
            order: order._id,
            kind: "SALE",
        }), 1);
        assert.equal(await Notification.countDocuments({
            dedupeKey: `new-order:${order._id}:${seller}`,
        }), 1);
        await OrderService.cancelOrder(String(buyer), String(order._id));
        const cancelled = (await Order.findById(order._id));
        const refunds = cancelled.refunds ?? [];
        assert.ok(refunds.length > 0, "Expected a refund record after cancellation");
        const refundRecord = refunds.at(-1);
        const refundPayload = JSON.stringify({
            event: "refund.processed",
            payload: {
                refund: {
                    entity: {
                        id: refundRecord
                            .razorpayRefundId,
                        payment_id: cancelled
                            .razorpayPaymentId,
                        amount: Math.round(Number(refundRecord
                            .amount) *
                            100),
                        status: "processed",
                        receipt: refundRecord
                            .requestId,
                        notes: {
                            refund_request_id: refundRecord
                                .requestId,
                        },
                    },
                },
            },
        });
        const refundHeaders = {
            "Content-Type": "application/json",
            "x-razorpay-signature": sign(refundPayload),
            "x-razorpay-event-id": "refund-http-event-1",
        };
        const beforeRefunded = Number(cancelled
            .refundedAmount ||
            0);
        const firstRefund = await fetch(`${base}/api/payment/webhook`, {
            method: "POST",
            headers: refundHeaders,
            body: refundPayload,
        });
        assert.equal(firstRefund.status, 200);
        const duplicateRefund = await fetch(`${base}/api/payment/webhook`, {
            method: "POST",
            headers: refundHeaders,
            body: refundPayload,
        });
        assert.equal(duplicateRefund.status, 200);
        assert.equal(Number((await Order.findById(order._id))
            .refundedAmount ||
            0), beforeRefunded);
    }
    finally {
        await new Promise((resolve, reject) => server.close(error => error
            ? reject(error)
            : resolve()));
    }
});
test("RazorpayX adapter uses paise, a stable idempotency key and rejects test validation", async () => {
    const { RazorpayXProvider } = await import("../dist/modules/payout/providers/razorpayX.provider.js");
    const adapter = new RazorpayXProvider();
    process.env.RAZORPAYX_KEY_ID = "rzp_test_fixture";
    process.env.RAZORPAYX_KEY_SECRET = "fixture";
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async (url, options) => {
        called++;
        assert.equal(url, "https://api.razorpay.com/v1/payouts");
        assert.equal((options?.headers)["X-Payout-Idempotency"], "fixture-stable-key");
        const body = JSON.parse(String(options?.body));
        assert.equal(body.amount, 12345);
        return new Response(JSON.stringify({ id: "pout_adapter", status: "queued", amount: 12345, currency: "INR", fund_account_id: "fa_fixture", reference_id: "fixture-stable-key" }));
    };
    try {
        await adapter.createPayout({ amount: 12345, fundAccountId: "fa_fixture", reference: "fixture-stable-key", sourceAccount: "fixture-source" });
        await assert.rejects(adapter.verifyBankAccount("fa_fixture"), /not enabled/);
        assert.equal(called, 1);
    }
    finally {
        globalThis.fetch = originalFetch;
    }
});
