import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FiPlus, FiRefreshCw } from 'react-icons/fi';
import { merchandiseAPI } from '../../services/api';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ONE_SIZE', 'CUSTOM'];
const blank = { name: '', sku: '', description: '', size: 'ONE_SIZE', price: '', stockQuantity: '' };

export default function MerchandiseSection() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const response = await merchandiseAPI.getProducts({});
      setProducts(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load products');
    }
  };

  useEffect(() => { refresh(); }, []);

  const createProduct = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await merchandiseAPI.createProduct({ ...form, price: Number(form.price), stockQuantity: Number(form.stockQuantity) });
      toast.success('Size and inventory added');
      setForm(blank);
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not add inventory');
    } finally {
      setBusy(false);
    }
  };

  const adjustStock = async (product) => {
    const rawDelta = window.prompt(`Stock adjustment for ${product.name} (${product.size || 'ONE_SIZE'}). Enter a positive or negative quantity:`);
    if (rawDelta === null) return;
    const quantityDelta = Number(rawDelta);
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) return toast.error('Enter a non-zero whole number');
    const reason = window.prompt('Reason for this stock adjustment:');
    if (!reason?.trim()) return;
    try {
      await merchandiseAPI.adjustStock(product.id, { quantityDelta, reason });
      toast.success('Inventory adjusted');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not adjust inventory');
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Merchandise inventory</h2>
        <p className="mt-1 text-sm text-slate-600">Create a separate SKU for each size so stock is reserved and tracked independently.</p>
      </div>
      <form onSubmit={createProduct} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name (e.g. Skyline Hoodie)" className="input-field" />
        <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Unique SKU (e.g. HOODIE-M)" className="input-field" />
        <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="input-field">{SIZES.map((size) => <option key={size}>{size}</option>)}</select>
        <input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price (INR)" className="input-field" />
        <input required type="number" min="0" step="1" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} placeholder="Opening stock" className="input-field" />
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"><FiPlus /> Add size inventory</button>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="input-field sm:col-span-2 lg:col-span-3" />
      </form>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product / SKU</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product.id}><td className="px-4 py-3"><div className="font-semibold text-slate-900">{product.name}</div><div className="text-xs text-slate-500">{product.sku}</div></td><td className="px-4 py-3">{product.size || 'ONE_SIZE'}</td><td className="px-4 py-3">₹{Number(product.price).toFixed(2)}</td><td className="px-4 py-3">{product.availableQuantity ?? product.stockQuantity}</td><td className="px-4 py-3"><button onClick={() => adjustStock(product)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-50">Adjust</button></td></tr>)}</tbody>
        </table>
        {!products.length && <div className="p-6 text-center text-sm text-slate-500">No products in the catalogue.</div>}
      </div>
      <button onClick={refresh} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><FiRefreshCw /> Refresh inventory</button>
    </section>
  );
}
