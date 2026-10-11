import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FiShoppingBag } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { merchandiseAPI, merchandisePaymentAPI } from '../../services/api';

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Merchandise() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sizes, setSizes] = useState({});
  const [quantities, setQuantities] = useState({});
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [productResponse, orderResponse] = await Promise.all([merchandiseAPI.getProducts({}), merchandiseAPI.getMyOrders()]);
      setProducts(productResponse.data?.data || []);
      setOrders(orderResponse.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load merchandise');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const groupedProducts = useMemo(() => {
    const groups = new Map();
    for (const product of products) {
      const key = product.name.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    }
    return [...groups.values()];
  }, [products]);

  const buy = async (product, quantity) => {
    setBusy(true);
    try {
      const orderResponse = await merchandiseAPI.createOrder({ items: [{ productId: product.id, quantity }] });
      const order = orderResponse.data?.data?.order;
      if (!order?.id) throw new Error('Could not create merchandise order');
      const paymentResponse = await merchandisePaymentAPI.createOrder(order.id);
      const payment = paymentResponse.data?.data;
      if (payment?.status === 'PAID') {
        toast.success('Order confirmed');
        await refresh();
        return;
      }
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay || !payment?.keyId || !payment?.orderId) throw new Error('Payment checkout is unavailable. Your stock reservation will expire automatically.');
      const checkout = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.orderId,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        name: 'Skyline Student Association',
        description: `${product.name} - ${product.size || 'ONE_SIZE'}`,
        prefill: { name: user?.name || '', email: user?.email || '' },
        handler: async (response) => {
          try {
            await merchandisePaymentAPI.verify(order.id, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            toast.success('Payment verified and order confirmed');
            await refresh();
          } catch (error) {
            toast.error(error.response?.data?.message || 'Payment verification failed');
          }
        },
        modal: { ondismiss: () => toast.info('Checkout closed. The stock hold will expire automatically.') },
      });
      checkout.on('payment.failed', (response) => {
        toast.error(response?.error?.description || 'Payment failed. Your stock hold will expire automatically.');
      });
      checkout.open();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not place order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7"><p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Association store</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-slate-950"><FiShoppingBag /> Club merchandise</h1><p className="mt-2 text-sm text-slate-600">Choose a size and order online. Stock is reserved while you complete payment.</p></header>
      {loading ? <p className="text-sm text-slate-500">Loading products…</p> : groupedProducts.length === 0 ? <p className="rounded-xl bg-white p-6 text-slate-500">No merchandise is available right now.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupedProducts.map((group) => {
            const selected = group.find((item) => String(item.id) === String(sizes[group[0].name]))
              || group.find((item) => (item.availableQuantity ?? item.stockQuantity) > 0)
              || group[0];
            const quantity = Number(quantities[group[0].name] || 1);
            return <article key={group[0].name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2><p className="mt-1 min-h-10 text-sm text-slate-600">{selected.description}</p>
              <label className="mt-4 block text-sm font-semibold text-slate-700">Size
                <select value={selected.id} onChange={(event) => setSizes({ ...sizes, [group[0].name]: event.target.value })} className="input-field mt-1 w-full">{group.map((item) => <option key={item.id} value={item.id} disabled={(item.availableQuantity ?? item.stockQuantity) < 1}>{item.size || 'ONE_SIZE'} — {item.availableQuantity ?? item.stockQuantity} left</option>)}</select>
              </label>
              <div className="mt-4 flex items-center justify-between"><span className="text-xl font-extrabold text-teal-700">₹{Number(selected.price).toFixed(2)}</span><input type="number" min="1" max={Math.max(1, selected.availableQuantity ?? selected.stockQuantity)} value={quantities[group[0].name] || 1} onChange={(event) => setQuantities({ ...quantities, [group[0].name]: event.target.value })} className="input-field w-20" /></div>
              <button disabled={busy || (selected.availableQuantity ?? selected.stockQuantity) < 1} onClick={() => buy(selected, quantity)} className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? 'Processing…' : 'Order and pay'}</button>
            </article>;
          })}
        </div>
      )}
      <section className="mt-10"><h2 className="mb-3 text-xl font-bold text-slate-900">Your recent orders</h2><div className="space-y-2">{orders.slice(0, 10).map((order) => <article key={order.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm"><span className="font-semibold">{order.orderNumber}</span><span>{order.items?.map((item) => `${item.name} (${item.size || 'ONE_SIZE'}) × ${item.quantity}`).join(', ')}</span><span>{order.orderStatus} · ₹{Number(order.totalAmount).toFixed(2)}</span></article>)}{orders.length === 0 && <p className="text-sm text-slate-500">No orders yet.</p>}</div></section>
    </main>
  );
}
