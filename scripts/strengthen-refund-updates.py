from pathlib import Path
p=Path(__file__).resolve().parents[1]/'src/modules/orders/order.service.ts'
s=p.read_text(encoding='utf-8')
# Retry database-only refund state application on transaction conflicts, keeping provider calls outside.
for startmarker,endmarker in [('const processRefundResponse = async (','const markRefundFailed = async ('),('const markRefundFailed = async (','export class OrderService')]:
    a=s.index(startmarker);b=s.index(endmarker,a+1);part=s[a:b]
    part=part.replace('    const order = await Order.findById(orderId);','''    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
    const order = await Order.findById(orderId).session(session);''',1)
    part=part.replace('    await order.save();','''    await order.save({ session });
    }); } finally { await session.endSession(); }''',1)
    if 'processRefundResponse' in startmarker:
        part=part.replace('    refundRecord.status = finalStatus;', '''    if (previousStatus === RefundStatus.PROCESSED) return;
    refundRecord.status = finalStatus;''')
    else:
        part=part.replace('    if (!refundRecord) {', '    if (!refundRecord || refundRecord.status === RefundStatus.PROCESSED) {')
    s=s[:a]+part+s[b:]
# Refund reservation is an order write and must participate in optimistic concurrency with document saves.
s=s.replace('''                            $inc: {
                                pendingRefundAmount:''','''                            $inc: {
                                __v: 1,
                                pendingRefundAmount:''')
p.write_text(s,encoding='utf-8')
