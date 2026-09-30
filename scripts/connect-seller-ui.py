from pathlib import Path
root=Path(__file__).resolve().parents[2]
for filename in ['Seller/src/screens/Profile/ProfileScreen.tsx','Seller/src/screens/Dashboard/DashboardScreen.tsx']:
    p=root/filename;s=p.read_text(encoding='utf-8')
    s='import PaymentOverview from "../Payments/PaymentOverview";\n'+s
    pos=s.index('</ScrollView>')
    s=s[:pos]+'<PaymentOverview />\n        '+s[pos:]
    p.write_text(s,encoding='utf-8')
p=root/'Seller/src/screens/Orders/OrderDetailsScreen.tsx';s=p.read_text(encoding='utf-8')
s=s.replace("value={capitalize(order.paymentStatus || 'pending')}","value={/cod/i.test(order.paymentMethod || '') ? (['success', 'paid'].includes(order.paymentStatus || '') || order.orderStatus === 'delivered' ? 'Paid / Collected' : 'Cash on Delivery') : 'Paid'}")
p.write_text(s,encoding='utf-8')
p=root/'Seller/src/screens/Orders/OrdersScreen.tsx';s=p.read_text(encoding='utf-8')
s=s.replace("{order.paymentMethod ||\n                                                'Payment'}", "{/cod/i.test(order.paymentMethod || '') ? 'Cash on Delivery' : 'Paid Online'}")
p.write_text(s,encoding='utf-8')
