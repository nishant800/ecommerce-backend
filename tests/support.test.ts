import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'support-fixture-only';
process.env.AI_API_KEY = 'sk-support-fixture-only';
process.env.AI_MODEL = 'gpt-4.1-mini';
process.env.AI_SUPPORT_DAILY_LIMIT = '30';
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: Order } = await import('../src/modules/orders/order.model.js');
const { SupportConversation, SupportTicket, SupportQuota } = await import('../src/modules/support/support.model.js');
const { default: routes } = await import('../src/modules/support/support.routes.js');
const { generateAccessToken } = await import('../src/modules/auth/jwt.js');
const { safeSupportContext } = await import('../src/modules/support/support.context.js');
const { sanitizeSupportText } = await import('../src/modules/support/support.security.js');
const { defaultPickupSchedule } = await import('../src/modules/orders/pickup-schedule.js');
const app = express(); app.use(express.json()); app.use('/api/support', routes);
const realFetch = globalThis.fetch;
let server: any; let url: string; let customer: any; let seller: any; let stranger: any; let admin: any;
let providerCalls: any[] = [];
let providerMode = 'success';
let providerPlan: any = { knowledgeIds: ['orders'], contextTopic: 'order', needsHuman: false };
globalThis.fetch = async (input: any, init?: any) => {
    if (String(input) !== 'https://api.openai.com/v1/responses') return realFetch(input, init);
    providerCalls.push(JSON.parse(init.body));
    if (providerMode === 'failure') return new Response('secret provider diagnostic', { status: 500 });
    if (providerMode === 'timeout') throw new Error('secret timeout diagnostic');
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(providerPlan) }] }] }), { status: 200 });
};
const token = (user: any, role = user.role) => generateAccessToken({ userId: String(user._id), role });
async function request(path: string, user: any = customer, body?: any, method = body ? 'POST' : 'GET', role?: string) {
    const response = await realFetch(url + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + token(user, role) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
}
async function fixture(overrides: any = {}, owner = customer, merchants = [seller]) {
    return Order.create({ user: owner._id, items: merchants.map((s: any) => ({ product: new mongoose.Types.ObjectId(), seller: s._id, name: 'Private product fixture', basePrice: 100, discountPrice: 80, price: 80, quantity: 1, fulfilmentStatus: 'processing' })), shippingAddress: { fullName: 'Private recipient', phone: '9999999912', house: 'Private street', area: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' }, subtotal: 80, total: 80, paymentMethod: 'online', paymentStatus: 'success', sellerReleasedAt: new Date(), orderStatus: 'processing', razorpayPaymentId: 'pay_private_fixture', ...overrides });
}
before(async () => {
    await mongoose.connect('mongodb://127.0.0.1:27119/support_fixture_' + process.pid + '?replicaSet=financeTest', { serverSelectionTimeoutMS: 15000 });
    await Promise.all([User.init(), Order.init(), SupportConversation.init(), SupportTicket.init(), SupportQuota.init()]);
    const make = (name: string, role: string, phone: string) => User.create({ name, email: name + '@fixture.test', phone, password: 'fixture-password', role, ...(role === 'seller' ? { business: { shopName: 'Private store', pickupEnabled: true, pickupSchedule: defaultPickupSchedule(), address: 'Private shop address', city: 'Akola', state: 'Maharashtra', pincode: '444001' } } : {}) });
    customer = await make('customer', 'customer', '9999999911'); seller = await make('seller', 'seller', '9999999912'); stranger = await make('stranger', 'customer', '9999999913'); admin = await make('admin', 'admin', '9999999914');
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); url = 'http://127.0.0.1:' + server.address().port + '/api/support';
});
after(async () => { globalThis.fetch = realFetch; await new Promise<void>(resolve => server?.close(() => resolve())); await mongoose.disconnect(); });
test('authentication and session-role authority reject unauthorized and spoofed support', async () => {
    assert.equal((await request('/chat', null, { role: 'customer', message: 'Order Help' })).status, 401);
    assert.equal((await request('/chat', customer, { role: 'seller', customerId: String(seller._id), message: 'Order Help' })).status, 403);
    assert.equal((await request('/chat', customer, { role: 'seller', message: 'Order Help' }, 'POST', 'seller')).status, 403);
    const sellerCustomerSession = await request('/chat', seller, { role: 'customer', message: 'Account Help' }, 'POST', 'customer');
    assert.equal(sellerCustomerSession.status, 200);
    assert.equal((await request('/admin/tickets', customer)).status, 403);
});
test('known generic questions bypass AI and conversations can be resumed only by owner', async () => {
    const count = providerCalls.length;
    const answer = await request('/chat', customer, { role: 'customer', message: 'How long is Store Pickup?' });
    assert.equal(answer.status, 200); assert.match(answer.body.data.message, /2 hours/); assert.equal(answer.body.data.source, 'knowledge'); assert.equal(providerCalls.length, count);
    const id = answer.body.data.conversationId;
    assert.equal((await request('/conversations/' + id)).body.data.messages.length, 2);
    assert.equal((await request('/conversations/' + id, stranger)).status, 404);
    assert.equal((await request('/chat', stranger, { role: 'customer', conversationId: id, message: 'Order Help' })).status, 404);
    assert.ok((await request('/conversations')).body.data.some((c: any) => c.conversationId === id));
});
test('order support uses fresh owned facts, preserves payment/refund uncertainty and binds conversation context', async () => {
    const order = await fixture({ orderStatus: 'out_for_delivery', paymentStatus: 'pending', paymentMethod: 'COD', refundStatus: 'pending' });
    const id = String(order._id);
    const answer = await request('/chat', customer, { role: 'customer', orderId: id, message: 'Where is my order?' });
    assert.equal(answer.status, 200); assert.match(answer.body.data.message, /Out for Delivery/);
    const cid = answer.body.data.conversationId;
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: 'delivered' } });
    assert.match((await request('/chat', customer, { role: 'customer', conversationId: cid, message: 'Where is my order?' })).body.data.message, /Delivered/);
    assert.match((await request('/chat', customer, { role: 'customer', orderId: id, message: 'Payment Help' })).body.data.message, /not confirm/);
    assert.match((await request('/chat', customer, { role: 'customer', orderId: id, message: 'Returns & Refunds' })).body.data.message, /completed refund is not confirmed/);
    assert.equal((await request('/chat', stranger, { role: 'customer', orderId: id, message: 'Where is my order?' })).status, 404);
    const another = await fixture();
    assert.equal((await request('/chat', customer, { role: 'customer', orderId: String(another._id), conversationId: cid, message: 'Order Help' })).status, 400);
    assert.equal((await request('/chat', customer, { role: 'customer', orderId: 'bad', message: 'Order Help' })).status, 400);
});
test('safe context omits raw documents, credentials and other sellers item statuses', async () => {
    const secondSeller = await User.create({ name: 'second', email: 'second@fixture.test', phone: '9999999915', password: 'fixture-password', role: 'seller' });
    const order = await fixture({}, customer, [seller, secondSeller]);
    await Order.updateOne({ _id: order._id }, { $set: { 'items.1.fulfilmentStatus': 'delivered', 'items.1.refundStatus': 'processed', orderStatus: 'shipped' } });
    const context = await safeSupportContext(String(seller._id), 'seller', String(order._id));
    assert.equal(context.order!.status, 'processing'); assert.deepEqual(context.order!.itemRefundStatuses, []);
    const serialized = JSON.stringify(context);
    for (const value of ['Private recipient', 'Private street', 'Private product', 'Private store', 'pay_private_fixture', 'shippingAddress', 'razorpay', 'password', 'email', 'userId', String(customer._id)]) assert.ok(!serialized.includes(value));
    const unpaid = await fixture({ paymentStatus: 'pending', sellerReleasedAt: null });
    await assert.rejects(safeSupportContext(String(seller._id), 'seller', String(unpaid._id)), /not found/);
});
test('pickup help explains actual reservation, elapsed deadline and refund-required flag safely', async () => {
    const order = await fixture({ fulfillmentType: 'pickup', paymentMethod: 'pay_at_store', paymentStatus: 'pending', pickup: { sellerId: seller._id, sellerName: 'Private store', address: { shopName: 'Private store', address: 'Private address', city: 'Akola', state: 'Maharashtra', pincode: '444001', country: 'India' }, status: 'reserved', reservedAt: new Date(Date.now() - 3 * 3600_000), expiresAt: new Date(Date.now() - 3600_000), token: 'private-qr-token', code: 'secret-pickup-code', refundRequired: true } });
    const answer = await request('/chat', customer, { role: 'customer', orderId: String(order._id), message: 'Store Pickup Help' });
    assert.equal(answer.status, 200); assert.match(answer.body.data.message, /deadline has elapsed/); assert.match(answer.body.data.message, /completion is not confirmed/);
    assert.ok(!JSON.stringify(answer.body).includes('private-qr-token'));
    const tracking = await request('/chat', customer, { role: 'customer', orderId: String(order._id), message: 'Where is my order?' });
    assert.match(tracking.body.data.message, /Reserved/); assert.ok(!tracking.body.data.message.includes('Home Delivery follows'));
});
test('seller quick help covers labels, scanning and seller-controlled schedules', async () => {
    const label = await request('/chat', seller, { role: 'seller', message: 'How do I ship an order?' });
    assert.equal(label.status, 200); assert.match(label.body.data.message, /second scan/i); assert.match(label.body.data.message, /Generate Shipping Label/);
    const settings = await request('/chat', seller, { role: 'seller', message: 'Store Pickup not working' });
    assert.equal(settings.status, 200); assert.match(settings.body.data.message, /weekly|special closure/i); assert.match(settings.body.data.message, /2 hours/);
});
test('AI selects grounded topics without displaying model-written policy, status or action claims', async () => {
    const order = await fixture({ refundStatus: 'pending' });
    providerPlan = { knowledgeIds: ['refunds'], contextTopic: 'refund', needsHuman: true, message: 'Refund completed and inventory changed' };
    const answer = await request('/chat', customer, { role: 'customer', orderId: String(order._id), message: 'Could you clarify the money-back situation in this case?' });
    assert.equal(answer.status, 200); assert.equal(answer.body.data.source, 'ai'); assert.match(answer.body.data.message, /completed refund is not confirmed/); assert.ok(!answer.body.data.message.includes('Refund completed and inventory changed'));
    const call = providerCalls.at(-1); assert.equal(call.store, false); assert.equal(call.max_output_tokens, 250); assert.equal(call.tools, undefined);
    assert.ok(call.instructions.includes('never invent')); assert.ok(JSON.stringify(call).length < 12000);
    for (const value of ['Private recipient', 'Private street', 'private-qr-token', 'pay_private_fixture', process.env.AI_API_KEY, String(customer._id)]) assert.ok(!JSON.stringify(call).includes(value));
    assert.equal((await Order.findById(order._id))!.refundStatus, 'pending');
});
test('provider errors, invalid plans, missing config and daily quota return safe retry/contact responses', async () => {
    providerMode = 'failure';
    const failed = await request('/chat', stranger, { role: 'customer', message: 'Could you clarify this unusual situation?' });
    assert.equal(failed.status, 503); assert.equal(failed.body.message, 'ECSLocal Help is temporarily unavailable.'); assert.ok(!JSON.stringify(failed.body).includes('secret provider'));
    providerMode = 'success'; providerPlan = { knowledgeIds: ['invented-policy'], contextTopic: 'none', needsHuman: false };
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'Another flexible question' })).status, 503);
    const savedKey = process.env.AI_API_KEY; delete process.env.AI_API_KEY;
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'Another flexible request' })).status, 503);
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'How long is Store Pickup?' })).status, 200);
    process.env.AI_API_KEY = savedKey; process.env.AI_SUPPORT_DAILY_LIMIT = '1'; providerPlan = { knowledgeIds: ['account'], contextTopic: 'none', needsHuman: true };
    await SupportQuota.deleteMany({ userId: stranger._id });
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'Tell me something about account assistance' })).status, 200);
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'Tell me another thing about account assistance' })).status, 429);
    process.env.AI_SUPPORT_DAILY_LIMIT = '30';
});
test('sensitive input is redacted before storage and provider requests; input lengths are enforced', async () => {
    assert.equal((await request('/chat', stranger, { role: 'customer', message: 'a'.repeat(1501) })).status, 400);
    assert.equal((await request('/chat', stranger, { role: 'customer', message: ' ' })).status, 400);
    providerPlan = { knowledgeIds: ['account'], contextTopic: 'none', needsHuman: true };
    const answer = await request('/chat', stranger, { role: 'customer', message: 'Please help: password=superSecret OTP: 123456 email fixture@private.test bank account: 123456789012 key ' + process.env.AI_API_KEY });
    assert.equal(answer.status, 200);
    const saved = await SupportConversation.findById(answer.body.data.conversationId);
    for (const value of ['superSecret', '123456', 'fixture@private.test', '123456789012', process.env.AI_API_KEY]) { assert.ok(!JSON.stringify(saved!.messages).includes(value)); assert.ok(!JSON.stringify(providerCalls.at(-1)).includes(value)); }
    assert.ok(!sanitizeSupportText('Bearer abc.def.ghi mongodb://user:pass@host/private').includes('user:pass'));
    for (const text of ['my OTP 123456', 'password hunter2', 'my PIN is 5678', '"password":"secret123"']) assert.ok(!/123456|hunter2|5678|secret123/.test(sanitizeSupportText(text)));
});
test('tickets work without AI, are idempotent and owned; admin queue publishes a human resolution', async () => {
    const key = process.env.AI_API_KEY; delete process.env.AI_API_KEY;
    const order = await fixture();
    const chat = await request('/chat', customer, { role: 'customer', orderId: String(order._id), message: 'Where is my order?' });
    const body = { role: 'customer', category: 'payment', subject: 'Payment dispute', message: 'Please review my payment. password=private-value', orderId: String(order._id), conversationId: chat.body.data.conversationId, requestKey: 'fixture_support_ticket_123456' };
    const first = await request('/tickets', customer, body); const retry = await request('/tickets', customer, body);
    assert.equal(first.status, 201); assert.equal(first.body.data.ticketId, retry.body.data.ticketId); assert.equal(first.body.data.status, 'open'); assert.ok(!first.body.data.message.includes('private-value'));
    assert.equal((await SupportConversation.findById(chat.body.data.conversationId))!.status, 'escalated');
    assert.equal((await request('/tickets', stranger)).body.data.length, 0);
    assert.equal((await request('/tickets', stranger, { ...body, requestKey: 'fixture_support_other_123456' })).status, 404);
    const id = first.body.data.ticketId;
    assert.equal((await request('/admin/tickets')).status, 403);
    assert.ok((await request('/admin/tickets?status=open', admin)).body.data.some((t: any) => t.ticketId === id));
    assert.equal((await request('/admin/tickets/' + id, admin, { status: 'resolved' }, 'PATCH')).status, 400);
    assert.equal((await request('/admin/tickets/' + id, admin, { status: 'resolved', resolution: 'Reviewed by support. Check Order Details for the verified outcome.' }, 'PATCH')).status, 200);
    const own = (await request('/tickets')).body.data.find((t: any) => t.ticketId === id); assert.equal(own.status, 'resolved'); assert.match(own.resolution, /Reviewed/);
    process.env.AI_API_KEY = key;
});
test('fraud/payment disputes and unknown context offer escalation without claiming a fix', async () => {
    const answer = await request('/chat', stranger, { role: 'customer', message: 'I was charged twice and suspect fraud' });
    assert.equal(answer.status, 200); assert.equal(answer.body.data.needsHuman, true); assert.ok(answer.body.data.suggestedActions.includes('contact_support'));
    assert.match(answer.body.data.message, /don't have enough information/);
});
test('per-user chat rate limit prevents abuse independently of AI usage', async () => {
    const limited = await User.create({ name: 'limited', email: 'limited@fixture.test', phone: '9999999916', password: 'fixture-password', role: 'customer' });
    for (let i = 0; i < 20; i++) assert.equal((await request('/chat', limited, { role: 'customer', message: 'Account Help' })).status, 200);
    assert.equal((await request('/chat', limited, { role: 'customer', message: 'Account Help' })).status, 429);
});

const { proposeAction, executeAction, refreshAction, SupportActionProposal, SupportActionAudit, SUPPORT_ACTIONS } = await import('../src/modules/support/support.actions.js');
test('controlled HTTP proposals require auth, allowlist and matching role; navigation executes once', async () => {
    const order = await fixture(); const id = String(order._id);
    assert.equal((await request('/actions/propose', null, { role: 'customer', type: 'OPEN_ORDER', resourceId: id })).status, 401);
    assert.equal((await request('/actions/propose', customer, { role: 'customer', type: 'MARK_DELIVERED', resourceId: id })).status, 400);
    assert.equal((await request('/actions/propose', customer, { role: 'customer', type: '__proto__' })).status, 400);
    assert.equal((await request('/actions/propose', customer, { role: 'customer', type: 'MARK_PICKUP_READY', resourceId: id })).status, 403);
    const p = await request('/actions/propose', customer, { role: 'customer', type: 'OPEN_ORDER', resourceId: id, amount: 1, status: 'delivered' });
    assert.equal(p.status, 200); assert.ok(p.body.data.confirmation.details.includes('Amount: ₹80'));
    const actionToken = p.body.data.actionToken;
    assert.equal((await request('/actions/execute', stranger, { role: 'customer', actionToken })).status, 404);
    const result = await request('/actions/execute', customer, { role: 'customer', actionToken });
    assert.equal(result.status, 200); assert.equal(result.body.data.workflow.type, 'OPEN_ORDER');
    assert.equal((await request('/actions/execute', customer, { role: 'customer', actionToken })).status, 409);
    assert.ok(await SupportActionAudit.exists({ action: 'OPEN_ORDER', result: 'workflow_opened', source: 'ai_support' }));
});
test('confirmation, expiry and live status revalidation block unsafe execution', async () => {
    const actor = { userId: String(customer._id), role: 'customer' as const }; const order = await fixture();
    const p = await proposeAction(actor, { type: 'CANCEL_ORDER', resourceId: String(order._id) });
    await assert.rejects(executeAction(actor, { actionToken: p.actionToken }), /Confirm/);
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: 'shipped' } });
    await assert.rejects(executeAction(actor, { actionToken: p.actionToken, confirmed: true }), /no longer be cancelled/);
    assert.equal((await Order.findById(order._id))!.orderStatus, 'shipped');
    const expired = await proposeAction(actor, { type: 'OPEN_ORDER', resourceId: String(order._id) });
    await SupportActionProposal.updateOne({ userId: customer._id, state: 'proposed' }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(executeAction(actor, { actionToken: expired.actionToken }), /expired/);
});
test('ticket execution is single use under concurrent requests and refresh never claims unpaid payment', async () => {
    const actor = { userId: String(customer._id), role: 'customer' as const };
    const p = await proposeAction(actor, { type: 'CREATE_SUPPORT_TICKET', category: 'other', subject: 'Action test', message: 'Please check this issue.' });
    const results = await Promise.allSettled([executeAction(actor, { actionToken: p.actionToken, confirmed: true }), executeAction(actor, { actionToken: p.actionToken, confirmed: true })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await SupportTicket.countDocuments({ userId: customer._id, subject: 'Action test' }), 1);
    const o = await fixture({ paymentStatus: 'pending', paymentMethod: 'online', orderStatus: 'pending', sellerReleasedAt: null, paymentRetryEnabled: true, paymentRetryExpiresAt: new Date(Date.now() + 60000) });
    const retry = await proposeAction(actor, { type: 'RETRY_PAYMENT', resourceId: String(o._id) });
    const r = await executeAction(actor, { actionToken: retry.actionToken, confirmed: true });
    assert.equal(r.workflow.type, 'RETRY_PAYMENT'); assert.equal((await Order.findById(o._id))!.paymentStatus, 'pending');
    assert.doesNotMatch((await refreshAction(actor, { actionToken: retry.actionToken })).message, /Payment confirmed/);
    assert.equal(Object.keys(SUPPORT_ACTIONS).length, 17);
});
test('seller ownership, reserved status and role restrict pickup ready and labels', async () => {
    const o = await fixture({ fulfillmentType: 'pickup', pickup: { sellerId: seller._id, status: 'reserved', reservedAt: new Date(), expiresAt: new Date(Date.now() + 60000), sellerName: 'Shop', address: { address: 'Market', city: 'Akola', state: 'Maharashtra', pincode: '444001' }, token: 'a'.repeat(64), code: 'ECS-TEST' } });
    const wrong = { userId: String(stranger._id), role: 'seller' as const };
    await assert.rejects(proposeAction(wrong, { type: 'MARK_PICKUP_READY', resourceId: String(o._id) }), /not found/);
    const actor = { userId: String(seller._id), role: 'seller' as const };
    const p = await proposeAction(actor, { type: 'MARK_PICKUP_READY', resourceId: String(o._id) }); assert.ok(p.requiresConfirmation);
    await Order.updateOne({ _id: o._id }, { $set: { 'pickup.status': 'ready' } });
    await assert.rejects(executeAction(actor, { actionToken: p.actionToken, confirmed: true }), /cannot be marked ready/);
    await assert.rejects(proposeAction(actor, { type: 'GENERATE_SHIPPING_LABEL', resourceId: String(o._id) }), /not eligible/);
});

test('opaque action tokens are redacted from free text before provider/storage use', () => {
    const secret = 'abcdef1234567890'.repeat(4);
    assert.equal(sanitizeSupportText('Here is ' + secret).includes(secret), false);
    assert.equal(providerCalls.some(call => JSON.stringify(call).includes('actionToken')), false);
});
