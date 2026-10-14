"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready: () => void; expand: () => void; colorScheme?: string } };
  }
}
type PackageItem = { id: string; name: string; description: string; duration_days: number; price_mmk: number; active: boolean; sort_order: number };
type PaymentItem = { id: string; provider: "KBZPay" | "AYAPay"; account_name: string; account_number: string; instructions: string; active: boolean; sort_order: number };
const emptyPackage = { name: "", description: "", duration_days: "30", price_mmk: "", active: true, sort_order: "0" };
const emptyPayment = { provider: "KBZPay" as "KBZPay" | "AYAPay", account_name: "", account_number: "", instructions: "", active: true, sort_order: "0" };
const money = (amount: number) => new Intl.NumberFormat("en-US").format(amount) + " Ks";

export default function AdminPage() {
  const [initData, setInitData] = useState("");
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [packageForm, setPackageForm] = useState(emptyPackage);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [editingPackage, setEditingPackage] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headers = useCallback(() => ({ "content-type": "application/json", "x-telegram-init-data": initData }), [initData]);
  const load = useCallback(async (raw: string) => {
    if (!raw) { setLoading(false); setError("Open this admin page inside Telegram using the configured admin account."); return; }
    try {
      const response = await fetch("/api/admin/packages", { headers: { "x-telegram-init-data": raw }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Admin access denied.");
      setPackages(data.packages ?? []);
      setPayments(data.payments ?? []);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load admin settings."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const raw = window.Telegram?.WebApp?.initData ?? "";
    setInitData(raw);
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    void load(raw);
  }, [load]);

  async function savePackage(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/packages", { method: "POST", headers: headers(), body: JSON.stringify({
        ...(editingPackage ? { id: editingPackage } : {}), ...packageForm,
        duration_days: Number(packageForm.duration_days), price_mmk: Number(packageForm.price_mmk), sort_order: Number(packageForm.sort_order),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save package.");
      setPackageForm(emptyPackage); setEditingPackage(null); setNotice("Package saved."); await load(initData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save package."); }
    finally { setBusy(false); }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/payments", { method: "POST", headers: headers(), body: JSON.stringify({
        ...(editingPayment ? { id: editingPayment } : {}), ...paymentForm, sort_order: Number(paymentForm.sort_order),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save payment method.");
      setPaymentForm(emptyPayment); setEditingPayment(null); setNotice("Payment account saved."); await load(initData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save payment method."); }
    finally { setBusy(false); }
  }

  async function deactivate(kind: "packages" | "payments", id: string) {
    if (!window.confirm("Deactivate this item? Existing orders will not be changed.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/${kind}`, { method: "DELETE", headers: headers(), body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not deactivate item.");
      setNotice("Item deactivated."); await load(initData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not deactivate item."); }
    finally { setBusy(false); }
  }

  return <main className="page-shell admin-shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">J</span><span>JBE <b>OUTLINE</b></span></Link><span className="status-pill"><i /> ADMIN SETTINGS</span></header>
    <section className="admin-intro"><p className="eyebrow"><span /> PRIVATE CONTROL PANEL</p><h1>Shop settings<span>.</span></h1><p>Manage the customer-facing packages, MMK prices, and payment accounts. Server secrets remain in Vercel environment variables.</p><Link href="/" className="back-link">← Back to shop</Link></section>

    {error && <p className="feedback error" role="alert">{error}</p>}
    {notice && <p className="feedback success" role="status">{notice}</p>}
    {loading ? <p className="panel-note">Loading settings…</p> : <>
      <section className="admin-panel">
        <div className="section-heading"><div><p className="eyebrow">01 / PRODUCT CATALOG</p><h2>VPN packages</h2><p className="panel-note">Add the three packages customers can buy.</p></div></div>
        <div className="admin-items">{packages.map((item) => <article className={item.active ? "admin-item" : "admin-item inactive"} key={item.id}><div><b>{item.name}</b><p>{item.duration_days} days · {money(item.price_mmk)} · {item.active ? "Active" : "Inactive"}</p>{item.description && <small>{item.description}</small>}</div><div className="admin-item-actions"><button className="small-button" onClick={() => { setEditingPackage(item.id); setPackageForm({ name: item.name, description: item.description, duration_days: String(item.duration_days), price_mmk: String(item.price_mmk), active: item.active, sort_order: String(item.sort_order) }); }}>Edit</button>{item.active && <button className="small-button danger-button" disabled={busy} onClick={() => void deactivate("packages", item.id)}>Deactivate</button>}</div></article>)}</div>
        <form className="admin-form" onSubmit={savePackage}>
          <h3>{editingPackage ? "Edit package" : "Add a package"}</h3>
          <label>Package name<input required maxLength={80} value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} placeholder="e.g. 30-Day Plan" /></label>
          <label>Description<input maxLength={240} value={packageForm.description} onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })} placeholder="Short detail shown to customers" /></label>
          <div className="admin-form-grid"><label>Duration (days)<input required type="number" min="1" max="3650" value={packageForm.duration_days} onChange={(e) => setPackageForm({ ...packageForm, duration_days: e.target.value })} /></label><label>Price (MMK)<input required type="number" min="0" step="1" value={packageForm.price_mmk} onChange={(e) => setPackageForm({ ...packageForm, price_mmk: e.target.value })} placeholder="Enter price" /></label><label>Display order<input type="number" value={packageForm.sort_order} onChange={(e) => setPackageForm({ ...packageForm, sort_order: e.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={packageForm.active} onChange={(e) => setPackageForm({ ...packageForm, active: e.target.checked })} /> Show to customers</label></div>
          <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : editingPackage ? "Save changes" : "Add package"}</button>{editingPackage && <button type="button" className="small-button" onClick={() => { setEditingPackage(null); setPackageForm(emptyPackage); }}>Cancel edit</button>}</div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="section-heading"><div><p className="eyebrow">02 / PAYMENT METHODS</p><h2>KBZPay & AYA Pay</h2><p className="panel-note">These account details are shown to customers after they create an order.</p></div></div>
        <div className="admin-items">{payments.map((item) => <article className={item.active ? "admin-item" : "admin-item inactive"} key={item.id}><div><b>{item.provider} · {item.account_name}</b><p>{item.account_number} · {item.active ? "Active" : "Inactive"}</p>{item.instructions && <small>{item.instructions}</small>}</div><div className="admin-item-actions"><button className="small-button" onClick={() => { setEditingPayment(item.id); setPaymentForm({ provider: item.provider, account_name: item.account_name, account_number: item.account_number, instructions: item.instructions, active: item.active, sort_order: String(item.sort_order) }); }}>Edit</button>{item.active && <button className="small-button danger-button" disabled={busy} onClick={() => void deactivate("payments", item.id)}>Deactivate</button>}</div></article>)}</div>
        <form className="admin-form" onSubmit={savePayment}>
          <h3>{editingPayment ? "Edit payment account" : "Add a payment account"}</h3>
          <div className="admin-form-grid"><label>Provider<select value={paymentForm.provider} onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value as "KBZPay" | "AYAPay" })}><option value="KBZPay">KBZPay</option><option value="AYAPay">AYA Pay</option></select></label><label>Account name<input required maxLength={100} value={paymentForm.account_name} onChange={(e) => setPaymentForm({ ...paymentForm, account_name: e.target.value })} /></label><label className="full-field">Account number<input required maxLength={50} value={paymentForm.account_number} onChange={(e) => setPaymentForm({ ...paymentForm, account_number: e.target.value })} /></label><label className="full-field">Payment instructions<input maxLength={300} value={paymentForm.instructions} onChange={(e) => setPaymentForm({ ...paymentForm, instructions: e.target.value })} placeholder="Optional customer-facing instructions" /></label><label>Display order<input type="number" value={paymentForm.sort_order} onChange={(e) => setPaymentForm({ ...paymentForm, sort_order: e.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={paymentForm.active} onChange={(e) => setPaymentForm({ ...paymentForm, active: e.target.checked })} /> Use for checkout</label></div>
          <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : editingPayment ? "Save changes" : "Add payment account"}</button>{editingPayment && <button type="button" className="small-button" onClick={() => { setEditingPayment(null); setPaymentForm(emptyPayment); }}>Cancel edit</button>}</div>
        </form>
      </section>
    </>}
    <footer className="footer"><span>JBE Outline VPN · Admin</span><span>Keep secrets in Vercel, not here.</span></footer>
  </main>;
}
