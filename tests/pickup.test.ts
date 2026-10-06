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
    await mongoose.connect(`mongodb://127.0.0.1:27119/pickup_fixture_${process.pid}?replicaSet=financeTest`, { serverSelectionTimeoutMS: 15000, heartbeatFrequencyMS: 60000 });
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
test('seller-specific address, two-hour backend deadline, server clock, stock deduction and opaque QR', async () => {
    const p = await product(); const result = await reserve(p); assert.equal(result.status, 201);
    const o = result.body.data; assert.equal(o.fulfillmentType, 'pickup'); assert.equal(o.shippingCharge, 0); assert.equal(o.total, 80);
    assert.equal(new Date(o.pickup.expiresAt).getTime() - new Date(o.pickup.reservedAt).getTime(), PICKUP_WINDOW_MS);
    assert.match(o.pickup.token, /^[a-f0-9]{64}$/); assert.equal(o.pickup.address.address, seller.business.address);
    assert.equal(String(o.pickup.sellerId), String(seller._id)); assert.equal((await Product.findById(p._id))!.stock, 3);
    const detail = await PickupService.detail(String(o._id), String(buyer._id)); assert.ok(detail.serverNow); assert.equal(detail.pickup!.token, o.pickup.token);
    const hidden = await Order.findById(o._id); assert.equal(hidden!.pickup!.token, undefined);
});
test('lost response / duplicate reservation key creates one order and deducts once', async () => {
    const p = await product(); const key = crypto.randomUUID(); const a = await reserve(p, 'pay_at_store', { pickupRequestKey: key });
    const b = await reserve(p, 'pay_at_store', { pickupRequestKey: key }); assert.equal(String(a.body.data._id), String(b.body.data._id)); assert.equal((await Product.findById(p._id))!.stock, 3);
});
test('QR validation is owner-only and customer detail is private', async () => {
    const p = await product(); const { body } = await reserve(p); const o = body.data;
    await assert.rejects(PickupService.validate(o.pickup.token, String(otherSeller._id)));
    await assert.rejects(PickupService.detail(String(o._id), String(otherSeller._id)));
    const valid = await PickupService.validate(o.pickup.token, String(seller._id)); assert.equal(valid.pickup!.token, undefined);
    assert.equal(String((await PickupService.validate(o.pickup.code, String(seller._id)))._id), String(o._id));
    assert.equal(String((await PickupService.validate(String(o._id), String(seller._id)))._id), String(o._id));
});
test('Pay at Store cannot complete unpaid; cash confirmation is idempotent and completion never decrements again', async () => {
    const p = await product(); const { body } = await reserve(p); const o = body.data;
    await assert.rejects(PickupService.sellerAction(String(o._id), String(seller._id), 'complete'), /payment/i);
    await PickupService.sellerAction(String(o._id), String(seller._id), 'ready');
    await PickupService.sellerAction(String(o._id), String(seller._id), 'cash');
    await PickupService.sellerAction(String(o._id), String(seller._id), 'cash');
    const paid = await Order.findById(o._id); assert.equal(paid!.paymentMethod, 'cash_at_store'); assert.equal(paid!.paymentStatus, 'success'); assert.ok(paid!.paidAt); assert.equal(String(paid!.paymentCollectedBySeller), String(seller._id));
    await PickupService.sellerAction(String(o._id), String(seller._id), 'complete');
    assert.equal((await Product.findById(p._id))!.stock, 3);
    await assert.rejects(PickupService.sellerAction(String(o._id), String(seller._id), 'complete'));
    await assert.rejects(PickupService.validate(o.pickup.token, String(seller._id)));
    assert.equal((await Order.findById(o._id))!.pickup!.status, 'picked_up');
});
test('Pay Online Now uses existing verified gateway; seller cannot substitute cash', async () => {
    const p = await product(); const { body } = await reserve(p, 'online'); const o = body.data;
    const captured = await verify(String(o._id)); assert.equal(captured!.paymentStatus, 'success');
    await assert.rejects(PickupService.sellerAction(String(o._id), String(seller._id), 'cash'));
    await PickupService.sellerAction(String(o._id), String(seller._id), 'complete');
    assert.equal((await Order.findById(o._id))!.pickup!.status, 'picked_up');
});
test('Pay at Store can switch to online; unverified signature/amount cannot mark paid', async () => {
    const p = await product(); const { body } = await reserve(p); const o = body.data;
    const g = await PickupService.createPayment(String(o._id), String(buyer._id));
    await assert.rejects(PickupService.sellerAction(String(o._id), String(seller._id), 'cash'));
    await assert.rejects(PaymentService.verifyPayment({ razorpay_order_id: g.razorpayOrder.id, razorpay_payment_id: 'pay_fake', razorpay_signature: 'a'.repeat(64) }, String(buyer._id)));
    assert.equal((await Order.findById(o._id))!.paymentStatus, 'pending');
    const paid = await verify(String(o._id)); assert.equal(paid!.paymentStatus, 'success'); assert.equal(paid!.paymentMethod, 'online');
});
test('customer cancellation preserves history, invalidates QR and releases inventory exactly once', async () => {
    const p = await product(); const { body } = await reserve(p); const o = body.data;
    await PickupService.release(String(o._id), 'cancelled', String(buyer._id)); await PickupService.release(String(o._id), 'cancelled', String(buyer._id));
    assert.equal((await Product.findById(p._id))!.stock, 4); assert.equal((await Order.findById(o._id))!.pickup!.status, 'cancelled');
    await assert.rejects(PickupService.validate(o.pickup.token, String(seller._id)));
    const fresh = await reserve(p); assert.notEqual(String(fresh.body.data._id), String(o._id)); assert.notEqual(fresh.body.data.pickup.token, o.pickup.token);
});
test('backend expiry releases unpaid inventory idempotently while apps are closed and does not call refund', async () => {
    const p = await product(); const { body } = await reserve(p); const o = body.data; const prior = refundCalls;
    await expire(String(o._id)); await PickupService.expireFor({ _id: o._id });
    assert.equal((await Order.findById(o._id))!.pickup!.status, 'expired'); assert.equal((await Product.findById(p._id))!.stock, 4); assert.equal(refundCalls, prior);
    await assert.rejects(PickupService.validate(o.pickup.token, String(seller._id)));
    await assert.rejects(PickupService.sellerAction(String(o._id), String(seller._id), 'complete'));
});
test('paid online expiry and cancellation use existing refunds; cash expiry is flagged for manual refund', async () => {
    const p = await product(); const a = await reserve(p, 'online'); await verify(String(a.body.data._id)); const prior = refundCalls;
    await expire(String(a.body.data._id)); assert.equal(refundCalls, prior + 1); assert.equal((await Order.findById(a.body.data._id))!.refundStatus, 'processed');
    const b = await reserve(p); await PickupService.sellerAction(String(b.body.data._id), String(seller._id), 'cash');
    await expire(String(b.body.data._id)); const cash = await Order.findById(b.body.data._id); assert.equal(cash!.pickup!.refundRequired, true); assert.equal(refundCalls, prior + 1);
});
test('late gateway capture after expiry stays expired and reconciles a refund', async () => {
    const p = await product(); const { body } = await reserve(p, 'online'); const o = body.data;
    const g = await PickupService.createPayment(String(o._id), String(buyer._id)); await expire(String(o._id)); const prior = refundCalls;
    await confirmCapturedPayment(String(o._id), 'pay_late'); assert.equal(refundCalls, prior + 1);
    const latest = await Order.findById(o._id); assert.equal(latest!.pickup!.status, 'expired'); assert.equal(latest!.refundStatus, 'processed'); assert.equal((await Product.findById(p._id))!.stock, 4);
});
test('two buyers cannot reserve the final unit; multi-seller, disabled, and missing-address pickup rejected', async () => {
    const p = await product(1); const result = await Promise.all([reserve(p), reserve(p, 'pay_at_store', {}, new mongoose.Types.ObjectId())]);
    assert.equal(result.filter(r => r.body.success).length, 1); assert.equal((await Product.findById(p._id))!.stock, 0);
    const a = await product(); const b = await product(3, { seller: otherSeller._id }); const mixed = await reserve(a, 'pay_at_store', { items: [{ product: a._id, quantity: 1 }, { product: b._id, quantity: 1 }] }); assert.equal(mixed.body.success, false); assert.equal((await Product.findById(a._id))!.stock, 4);
    await User.updateOne({ _id: otherSeller._id }, { $set: { 'business.pickupEnabled': false } }); assert.equal((await reserve(b)).body.success, false);
    await User.updateOne({ _id: otherSeller._id }, { $set: { 'business.pickupEnabled': true, 'business.address': '' } }); assert.equal((await reserve(b)).body.success, false);
});
test('variant reservations and expiry preserve child stock, aggregate stock and deleted-product history', async () => {
    const p = await product(3, { variants: [{ sku: 'size-fixture', price: 100, discountPrice: 80, sizes: [{ size: '2.4', stock: 3 }], stock: 3 }] });
    const { body } = await reserve(p, 'pay_at_store', { items: [{ product: p._id, quantity: 2, variant: { sku: 'size-fixture' }, optionType: 'size', optionValue: '2.4' }] });
    assert.equal(body.success, true); assert.equal((await Product.findById(p._id))!.variants[0].sizes![0].stock, 1);
    await expire(String(body.data._id)); assert.equal((await Product.findById(p._id))!.variants[0].sizes![0].stock, 3);
    const d = await product(); const reservation = await reserve(d); await Product.deleteOne({ _id: d._id }); await expire(String(reservation.body.data._id));
    const latest = await Order.findById(reservation.body.data._id); assert.equal(latest!.pickup!.status, 'expired'); assert.equal(latest!.pickup!.stockReleaseIssues!.length, 1);
});
test('delivery checkout, old orders and generic item-cancellation guards remain compatible', async () => {
    const p = await product(); const address = { fullName: 'Buyer', phone: '9999999903', house: '1', area: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' };
    const delivery = await reserve(p, 'COD', { fulfillmentType: 'delivery', pickupRequestKey: undefined, shippingAddress: address });
    assert.equal(delivery.body.success, true); assert.equal(delivery.body.data.fulfillmentType, 'delivery'); assert.equal(delivery.body.data.shippingCharge, 30); assert.equal(delivery.body.data.total, 110);
    await Order.updateOne({ _id: delivery.body.data._id }, { $unset: { fulfillmentType: 1 } });
    assert.ok(await OrderService.getOrder(String(buyer._id), String(delivery.body.data._id)));
    const pickup = await reserve(p); await assert.rejects(OrderService.cancelOrderItem(String(buyer._id), String(pickup.body.data._id), 0), /pickup/i);
    const visible = await SellerService.getOrders(String(seller._id)); assert.ok(visible.some((o: any) => String(o._id) === String(pickup.body.data._id)));
});

test('schedule edits preserve existing QR and expiry; new reservations reject closures; cancellation remains explicit', async () => {
    const p = await product(); const reserved = await reserve(p); assert.equal(reserved.body.success, true);
    const id = String(reserved.body.data._id); const token = reserved.body.data.pickup.token;
    const expiry = new Date(reserved.body.data.pickup.expiresAt).getTime();
    const store = await User.findById(seller._id); const schedule = structuredClone(store!.business!.pickupSchedule!);
    schedule.specialClosures = [{ date: '2026-10-05', reason: 'Maintenance' }];
    await assert.rejects(SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule } }), (error: any) => error.activePickupCount > 0);
    assert.equal((await User.findById(seller._id))!.business!.pickupSchedule!.specialClosures.length, 0);
    await SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule }, pickupClosureAction: 'keep' });
    assert.equal((await reserve(p)).body.success, false);
    const detail = await PickupService.validate(token, String(seller._id)); assert.equal(detail.pickup!.status, 'reserved'); assert.equal(new Date(detail.pickup!.expiresAt).getTime(), expiry); assert.equal(detail.storeSchedule.isOpen, false);
    const available = await PickupService.availability(String(p._id)); assert.equal(available.available, false);
    const publicPayload = JSON.stringify(available); assert.ok(!publicPayload.includes(seller.phone)); assert.ok(!publicPayload.includes('password'));
    schedule.specialClosures = []; schedule.temporarilyClosed = true;
    await assert.rejects(SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule } }), (error: any) => error.activePickupCount > 0);
    await SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule }, pickupClosureAction: 'keep' });
    assert.equal((await PickupService.validate(token, String(seller._id))).pickup!.status, 'reserved');
    schedule.temporarilyClosed = false; await SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule } });
    await PickupService.release(id, 'cancelled', String(buyer._id));
});

test('actual creation at 5 PM and 6 PM succeeds; 6:01 PM fails without stock deduction', async () => {
    const p = await product();
    try {
        mock.timers.setTime(new Date('2026-10-05T11:30:00Z').getTime()); assert.equal((await reserve(p)).body.success, true);
        mock.timers.setTime(new Date('2026-10-05T12:30:00Z').getTime()); const exact = await reserve(p); assert.equal(exact.body.success, true);
        assert.equal(new Date(exact.body.data.pickup.expiresAt).getTime() - new Date(exact.body.data.pickup.reservedAt).getTime(), PICKUP_WINDOW_MS);
        mock.timers.setTime(new Date('2026-10-05T12:31:00Z').getTime()); const denied = await reserve(p); assert.equal(denied.body.success, false); assert.match(denied.body.message, /unavailable after/);
        assert.equal((await Product.findById(p._id))!.stock, 2);
    } finally { mock.timers.setTime(new Date('2026-10-05T11:30:00Z').getTime()); }
});
test('seller explicitly cancelling closure conflicts reuses paid-order refund and restores inventory', async () => {
    const p = await product(); const reserved = await reserve(p, 'online'); assert.equal(reserved.body.success, true);
    const id = String(reserved.body.data._id); await verify(id); const prior = refundCalls;
    const store = await User.findById(seller._id); const schedule = structuredClone(store!.business!.pickupSchedule!);
    schedule.specialClosures = [{ date: '2026-10-05', reason: 'Holiday' }];
    await SellerService.updateProfile(String(seller._id), { business: { pickupSchedule: schedule }, pickupClosureAction: 'cancel' });
    const cancelled = await Order.findById(id); assert.equal(cancelled!.pickup!.status, 'cancelled'); assert.equal(cancelled!.refundStatus, 'processed'); assert.ok(refundCalls > prior);
    assert.equal((await Product.findById(p._id))!.stock, 4);
});

test('strict delivery lifecycle, first/second label lookup, terminal states and seller security', async () => {
    const p = await product();
    const address = { fullName: 'Delivery Buyer', phone: '9999999903', house: '1', area: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' };
    const result = await reserve(p, 'COD', { fulfillmentType: 'delivery', pickupRequestKey: undefined, shippingAddress: address });
    assert.equal(result.body.success, true); const id = String(result.body.data._id); const owner = String(seller._id);
    assert.equal((await SellerService.resolveDeliveryBarcode(owner, id)).allowedAction, null);
    assert.equal((await Order.findById(id))!.orderStatus, 'processing');
    await assert.rejects(SellerService.updateOrderStatus(owner, id, 'delivered'), /transition/i);
    assert.ok((await Order.findById(id))!.processingAt);
    await assert.rejects(SellerService.updateOrderStatus(owner, id, 'shipped'), /shipping label/i);
    await assert.rejects(SellerService.updateOrderStatus(owner, id, 'out_for_delivery'), /transition/i);
    await SellerService.markOrderShippedAfterLabel(owner, id);
    const preview = await SellerService.resolveDeliveryBarcode(owner, id); assert.equal(String(preview.order._id), id); assert.equal(preview.allowedAction, 'MARK_OUT_FOR_DELIVERY'); assert.ok((await Order.findById(id))!.shippingLabelGeneratedAt);
    assert.equal((await SellerService.resolveDeliveryBarcode(owner, JSON.stringify({ orderId: id, total: 1 }))).order.orderStatus, 'shipped');
    await assert.rejects(SellerService.resolveDeliveryBarcode(String(otherSeller._id), id), /belong/i);
    await assert.rejects(SellerService.resolveDeliveryBarcode(owner, 'SKU-123'), /order shipping label/i);
    await assert.rejects(SellerService.resolveDeliveryBarcode(owner, String(p._id)), /not found/i);
    await assert.rejects(SellerService.resolveDeliveryBarcode(owner, '{}'), /order shipping label/i);
    await assert.rejects(SellerService.updateOrderStatus(owner, id, 'delivered'), /transition/i);
    const pickupProduct = await product();
    const onRoad = await SellerService.updateOrderStatus(owner, id, 'out_for_delivery'); assert.equal(onRoad!.orderStatus, 'out_for_delivery');
    const stored = await Order.findById(id); assert.equal(stored!.items[0].fulfilmentStatus, 'out_for_delivery'); assert.ok(stored!.outForDeliveryAt); assert.ok(stored!.items[0].outForDeliveryAt);
    await SellerService.updateOrderStatus(owner, id, 'out_for_delivery');
    const notifications = await Notification.find({ order: id, message: 'Your order is out for delivery.' }); assert.equal(notifications.length, 1);
    assert.equal((await SellerService.resolveDeliveryBarcode(owner, id)).allowedAction, 'MARK_DELIVERED');
    const done = await SellerService.updateOrderStatus(owner, id, 'delivered'); assert.equal(done!.orderStatus, 'delivered'); assert.equal((await Order.findById(id))!.paymentStatus, 'success');
    const deliveredLookup = await SellerService.resolveDeliveryBarcode(owner, id);
    assert.equal(deliveredLookup.allowedAction, null); assert.equal(deliveredLookup.message, 'Order already delivered');
    const delivered = await Order.findById(id); assert.ok(delivered!.deliveredAt); assert.ok(delivered!.items[0].deliveredAt);
    assert.equal((await Notification.find({ order: id, message: 'Your order has been shipped.' })).length, 1);
    assert.equal((await Notification.find({ order: id, message: 'Your order has been delivered.' })).length, 1);
    await assert.rejects(SellerService.updateOrderStatus(owner, id, 'out_for_delivery'), /transition/i);
    const defaultSettings = (await User.findById(seller._id))!.business!.pickupSchedule!;
    defaultSettings.specialClosures = []; await SellerService.updateProfile(owner, { business: { pickupSchedule: defaultSettings } });
    const pickupResult = await reserve(pickupProduct); assert.equal(pickupResult.body.success, true);
    await assert.rejects(SellerService.resolveDeliveryBarcode(owner, String(pickupResult.body.data._id)), /Store Pickup/i);
    await assert.rejects(SellerService.updateOrderStatus(owner, String(pickupResult.body.data._id), 'out_for_delivery'), /Store Pickup/i);
    await PickupService.release(String(pickupResult.body.data._id), 'cancelled', String(buyer._id));
});


test('delivery item preparation cannot advance another seller; legacy missing fulfillment and terminal lookups remain compatible', async () => {
    const a = await product(); const b = await product(4, { seller: otherSeller._id });
    const result = await reserve(a, 'COD', { fulfillmentType: 'delivery', pickupRequestKey: undefined,
        shippingAddress: { fullName: 'Buyer', phone: '9999999903', house: '1', area: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' },
        items: [{ product: String(a._id), quantity: 1 }, { product: String(b._id), quantity: 1 }] });
    assert.equal(result.body.success, true); const id = String(result.body.data._id);
    await Order.updateOne({ _id: id }, { $unset: { fulfillmentType: 1 } });
    assert.equal((await SellerService.getOrder(String(otherSeller._id), id))!.orderStatus, 'processing');
    await SellerService.markOrderShippedAfterLabel(String(seller._id), id);
    assert.equal((await SellerService.resolveDeliveryBarcode(String(seller._id), id)).allowedAction, 'MARK_OUT_FOR_DELIVERY');
    assert.equal((await SellerService.resolveDeliveryBarcode(String(otherSeller._id), id)).allowedAction, null);
    await Order.updateOne({ _id: id }, { $set: { orderStatus: 'cancelled' } });
    assert.equal((await SellerService.resolveDeliveryBarcode(String(seller._id), id)).allowedAction, null);
    await Order.updateOne({ _id: id }, { $set: { orderStatus: 'shipped', 'items.0.refundStatus': 'pending' } });
    assert.equal((await SellerService.resolveDeliveryBarcode(String(seller._id), id)).allowedAction, null);
    await assert.rejects(SellerService.updateOrderStatus(String(seller._id), id, 'out_for_delivery'), /Refunded/i);
    await Order.updateOne({ _id: id }, { $set: { 'items.0.cancelledQuantity': 1 } });
    assert.equal((await SellerService.resolveDeliveryBarcode(String(seller._id), id)).allowedAction, null);
});
