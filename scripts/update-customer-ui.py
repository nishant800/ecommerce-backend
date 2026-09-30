from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
def edit(name,fn):
    p=root/name;p.write_text(fn(p.read_text(encoding='utf-8')),encoding='utf-8')
def orderapi(s):
    s=s.replace('    paymentStatus: string;', '''    paymentStatus: string;
    paymentRetryEnabled?: boolean;
    paymentRetryExpiresAt?: string | null;
    paymentAttemptCount?: number;
    sellerReleasedAt?: string | null;
    serverTime?: string;''')
    # Carry server clock alongside the order through the existing response shape.
    s=s.replace('    return response.data;', '''    if (response.data?.data && response.data.serverTime) {
        if (Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((entry: object) => ({ ...entry, serverTime: response.data.serverTime }));
        } else { response.data.data.serverTime = response.data.serverTime; }
    }
    return response.data;''')
    s=s.replace('    data: CreatedOrder;', '    data: CreatedOrder;\n    serverTime?: string;')
    return s
edit('EcommerceAppNew/src/features/orders/orderApi.ts',orderapi)
def details(s):
    s='import PaymentRetryCard from "../../features/payment/PaymentRetryCard";\nimport { paymentStatusLabel } from "../../features/payment/paymentStatus";\n'+s
    s=s.replace('''                setOrder(
                    response?.data ||
                    response,
                );''','''                const next = response?.data || response;
                setOrder((previous: typeof next) => {
                    if (previous?.paymentStatus === 'success' && next?.paymentStatus !== 'success') return previous;
                    if (previous?.updatedAt && next?.updatedAt && Date.parse(previous.updatedAt) > Date.parse(next.updatedAt)) return previous;
                    return next;
                });''')
    a=s.index('    const displayPaymentStatus =');b=s.index('    const onlinePayment =',a)
    s=s[:a]+'    const displayPaymentStatus = paymentStatusLabel(order);\n'+s[b:]
    s=s.replace('<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>','<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>\n                <PaymentRetryCard order={order} reload={() => loadOrder(false)} cancel={handleCancelOrder} />')
    s=s.replace("normalizedOrderStatus === 'cancelled' &&\n        onlinePayment", 'onlinePayment')
    # Existing item refunds remain; add reference and explicit state label.
    s=s.replace('Refund: ₹{Number(item.refundAmount).toFixed(2)}', "{item.refundStatus === 'processed' ? 'Refund Completed' : item.refundStatus === 'failed' ? 'Refund Failed' : 'Refund Processing'}: ₹{Number(item.refundAmount).toFixed(2)}{item.refundId ? ` • Refund ID: ${item.refundId}` : ''}")
    return s
edit('EcommerceAppNew/src/screens/Orders/OrderDetailsScreen.tsx',details)
def orders(s):
    s='import { paymentStatusLabel, isAwaitingPayment, type PaymentState } from "../../features/payment/paymentStatus";\n'+s
    s=s.replace('interface Order {', 'interface Order extends PaymentState {')
    s=s.replace('{/* PRODUCT PREVIEW */}', '''<Text style={{ color: COLORS.subText, marginBottom: 8 }}>{order.paymentMethod.toUpperCase() === 'COD' ? 'COD' : 'Online'} · {paymentStatusLabel(order)}</Text>
                                    {isAwaitingPayment(order) && <Text style={{ color: COLORS.primary, fontWeight: '700', marginBottom: 8 }}>Retry Payment — View reservation</Text>}
                                    {order.refundStatus === 'pending' && <Text style={{ color: COLORS.warning }}>Refund Processing</Text>}
                                    {order.refundStatus === 'processed' && <Text style={{ color: COLORS.success }}>Refunded</Text>}
                                    {/* PRODUCT PREVIEW */}''')
    return s
edit('EcommerceAppNew/src/screens/Orders/OrdersScreen.tsx',orders)
def checkout(s):
    a=s.index('    const handlePlaceOrder =')
    b=s.index('            try {', a)
    s=s[:b]+'            let placedOrderId: string | undefined;\n'+s[b:]
    m=re.search(r'                const orderId =\s*([^;]+);',s)
    assert m
    s=s[:m.end()]+'\n                placedOrderId = String(orderId);'+s[m.end():]
    a=s.index('            } catch (',s.index('    const handlePlaceOrder ='))
    b=s.index('                console.error(',a)
    s=s[:b]+'''                if (placedOrderId) {
                    navigation.replace('OrderDetails', { orderId: placedOrderId });
                    return;
                }
'''+s[b:]
    s=s.replace("navigation.replace(\n                                        'Orders',\n                                    );", "navigation.replace('OrderDetails', { orderId });")
    return s
edit('EcommerceAppNew/src/screens/Checkout/CheckoutScreen.tsx',checkout)
for name in ['EcommerceAppNew/src/constants/config.ts','EcommerceAppNew/src/api/axios.ts','Seller/src/api/api.ts']:
    edit(name,lambda s:re.sub(r'http://192\.168\.1\.\d+:5000/api(?:/api)?','https://ecommerce-backend-1-w2fh.onrender.com/api',s))
