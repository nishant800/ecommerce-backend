import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'pickup-fixture-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
process.env.RAZORPAY_KEY_SECRET = 'fixture-only';
process.env.SINGLE_SELLER_MODE = 'false';
process.env.MARKETPLACE_COMMISSION_PERCENT = '10';
process.env.SELLER_SETTLEMENT_HOLD_DAYS = '0';
process.env.SELLER_PAYOUT_MINIMUM_PAISE = '100';
process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS = 'false';
process.env.SELLER_BANK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'pickup-fixture', client_email: 'test@pickup-fixture.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const { default: Order } = await import('../src/modules/orders/order.model.js');
const { default: Product } = await import('../src/modules/products/product.model.js');
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: Notification } = await import('../src/notifications/notification.model.js');
const { PickupService, PICKUP_WINDOW_MS } = await import('../src/modules/orders/pickup.service.js');
const { createOrder } = await import('../src/modules/orders/order.controller.js');
const { OrderService } = await import('../src/modules/orders/order.service.js');
const { PaymentService } = await import('../src/modules/payment/payment.service.js');
const { SellerService } = await import('../src/modules/seller/seller.service.js');
const { confirmCapturedPayment } = await import('../src/modules/payment/payment-lifecycle.js');
const { default: razorpay } = await import('../src/modules/payment/razorpay.js');
const { FirebaseMessagingService } = await import('../src/modules/notifications/firebaseMessaging.service.js');
FirebaseMessagingService.sendToUser = async () => {};
const gatewayOrders = new Map<string, any>();
let refundCalls = 0;
PaymentService.refundPayment = async (id, _payment, amount) => { refundCalls++; return { id: `rfnd_${id}`, status: 'processed', amount: Math.round(amount * 100) }; };
razorpay.orders.create = async (data: any) => { const order = { ...data, id: `order_${crypto.randomBytes(6).toString('hex')}`, status: 'created' }; gatewayOrders.set(order.id, order); return order; };
razorpay.orders.fetch = async (id: string) => gatewayOrders.get(id);
let paymentFixture: any;
razorpay.payments.fetch = async () => paymentFixture;
let seller: any; let otherSeller: any; let buyer: any;
before(async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T11:30:00Z').getTime() });
    // Keep driver heartbeat timing outside this short suite while schedule tests jump the mocked Date clock.
    await mongoose.connect(`mongodb://127.0.0.1:27119/delivery_fixture_${process.pid}?replicaSet=financeTest`, { serverSelectionTimeoutMS: 15000, heartbeatFrequencyMS: 60000 });
    await Promise.all([Order.init(), Product.init(), User.init(), Notification.init()]);
    const makeSeller = (tag: string) => User.create({ name: tag, email: `${tag}@fixture.test`, phone: tag === 'seller' ? '9999999901' : '9999999902', password: 'fixture-password', role: 'seller', business: { pickupEnabled: true, shopName: tag, address: '1 Market Street', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' } });
    seller = await makeSeller('seller'); otherSeller = await makeSeller('other');
    buyer = await User.create({ name: 'Buyer', email: 'buyer@fixture.test', phone: '9999999903', password: 'fixture-password', role: 'customer' });
});
after(async () => { await mongoose.disconnect(); mock.timers.reset(); });
async function product(stock = 4, overrides: any = {}) {
    return Product.create({ name: 'Pickup Fixture', slug: crypto.randomUUID(), sku: crypto.randomUUID(), price: 100, discountPrice: 80, stock,
        seller: seller._id, category: new mongoose.Types.ObjectId(), subcategory: new mongoose.Types.ObjectId(), brand: new mongoose.Types.ObjectId(), active: true, ...overrides });
}
async function reserve(p: any, method = 'pay_at_store', overrides: any = {}, customer = buyer._id) {
    let status = 200; let response: any;
    const req = { user: { userId: String(customer) }, body: { items: [{ product: String(p._id), quantity: 1 }], fulfillmentType: 'pickup', paymentMethod: method, pickupRequestKey: crypto.randomUUID(), ...overrides } };
    const res = { status(value: number) { status = value; return this; }, json(value: any) { response = value; return this; } };
    await createOrder(req as any, res as any);
    return { status, body: response };
}
async function expire(id: string) {
    await Order.updateOne({ _id: id }, { $set: { 'pickup.expiresAt': new Date(Date.now() - 1000) } });
    await PickupService.expireFor({ _id: id });
}
async function verify(id: string) {
    const result = await PickupService.createPayment(id, String(buyer._id));
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    paymentFixture = { order_id: result.razorpayOrder.id, status: 'captured', currency: 'INR', amount: result.razorpayOrder.amount };
    const signature = crypto.createHmac('sha256', 'fixture-only').update(`${result.razorpayOrder.id}|${paymentId}`).digest('hex');
    return PaymentService.verifyPayment({ razorpay_order_id: result.razorpayOrder.id, razorpay_payment_id: paymentId, razorpay_signature: signature }, String(buyer._id));
}

async function deliver(p: any, method = 'COD') {
    return reserve(p, method, { fulfillmentType: 'delivery', shippingAddress: { fullName: 'Buyer', phone: '9999999903', house: '1 Home', area: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' } });
}
test('COD starts processing with placed timestamp, label-only shipping and delivery sequence', async () => {
    const result = await deliver(await product()); assert.equal(result.status, 201);
    const o = result.body.data;
    assert.equal(o.orderStatus, 'processing'); assert.ok(o.createdAt); assert.ok(o.processingAt);
    assert.equal(o.items[0].fulfilmentStatus, 'processing'); assert.ok(o.items[0].processingAt);
    assert.equal(o.paymentStatus, 'pending');
    await assert.rejects(SellerService.updateOrderStatus(String(seller._id), String(o._id), 'shipped'), /shipping label/);
    await assert.rejects(SellerService.updateOrderStatus(String(seller._id), String(o._id), 'delivered'), /Invalid order transition/);
    assert.equal((await SellerService.markOrderShippedAfterLabel(String(seller._id), String(o._id))).orderStatus, 'shipped');
    assert.equal((await SellerService.updateOrderStatus(String(seller._id), String(o._id), 'out_for_delivery')).orderStatus, 'out_for_delivery');
    const done = await SellerService.updateOrderStatus(String(seller._id), String(o._id), 'delivered');
    assert.equal(done.orderStatus, 'delivered'); assert.equal(done.paymentStatus, 'success');
});
test('online remains pending until verified capture; duplicate callbacks preserve progress', async () => {
    const result = await deliver(await product(), 'online'); assert.equal(result.status, 201);
    const o = result.body.data; assert.equal(o.orderStatus, 'pending'); assert.equal(o.processingAt, null);
    assert.equal(await SellerService.getOrder(String(seller._id), String(o._id)), null);
    const gateway = await PaymentService.createPayment(String(o._id), String(buyer._id));
    const paymentId = 'pay_delivery_fixture';
    const signature = crypto.createHmac('sha256', 'fixture-only').update(gateway.razorpayOrder.id + '|' + paymentId).digest('hex');
    const data = { razorpay_order_id: gateway.razorpayOrder.id, razorpay_payment_id: paymentId, razorpay_signature: signature };
    await assert.rejects(PaymentService.verifyPayment({ ...data, razorpay_signature: '0'.repeat(64) }, String(buyer._id)), /signature/);
    paymentFixture = { order_id: gateway.razorpayOrder.id, status: 'authorized', currency: 'INR', amount: gateway.razorpayOrder.amount };
    await assert.rejects(PaymentService.verifyPayment(data, String(buyer._id)), /confirmation pending/);
    assert.equal((await Order.findById(o._id))!.orderStatus, 'pending');
    paymentFixture.status = 'captured';
    const paid = await PaymentService.verifyPayment(data, String(buyer._id));
    assert.equal(paid!.orderStatus, 'processing'); assert.equal(paid!.items[0].fulfilmentStatus, 'processing');
    const timestamp = paid!.processingAt!.getTime();
    await SellerService.markOrderShippedAfterLabel(String(seller._id), String(o._id));
    const duplicate = await confirmCapturedPayment(String(o._id), paymentId, 'delivery-duplicate');
    assert.equal(duplicate!.orderStatus, 'shipped'); assert.equal(duplicate!.processingAt!.getTime(), timestamp);
});
test('cancelled capture stays cancelled, and processing COD still supports cancellation', async () => {
    const cod = (await deliver(await product())).body.data;
    await OrderService.cancelOrder(String(buyer._id), String(cod._id));
    assert.equal((await Order.findById(cod._id))!.orderStatus, 'cancelled');
    const online = (await deliver(await product(), 'online')).body.data;
    await OrderService.cancelOrder(String(buyer._id), String(online._id));
    const captured = await confirmCapturedPayment(String(online._id), 'pay_cancelled_delivery');
    assert.equal(captured!.orderStatus, 'cancelled'); assert.equal(captured!.processingAt, null);
});
test('historical placed COD safely normalizes and can generate a label', async () => {
    const o = (await deliver(await product())).body.data;
    await Order.collection.updateOne({ _id: o._id }, { $set: { orderStatus: 'placed', processingAt: null, 'items.0.fulfilmentStatus': 'pending', 'items.0.processingAt': null } });
    assert.equal((await SellerService.getOrder(String(seller._id), String(o._id))).orderStatus, 'processing');
    assert.equal((await SellerService.markOrderShippedAfterLabel(String(seller._id), String(o._id))).orderStatus, 'shipped');
});
