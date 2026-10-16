"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready: () => void; expand: () => void; colorScheme?: string } };
  }
}

type PackageItem = { id: string; name: string; description: string; duration_days: number; price_mmk: number };
type ServerItem = { id: string; name: string; region: string; stock: number; available: boolean };
type Payment = { provider: "KBZPay" | "AYAPay"; account_name: string; account_number: string; instructions: string };
type Order = {
  id: string; package_name_snapshot: string; duration_days_snapshot: number; price_mmk: number;
  status: string; created_at: string;
  outline_vpn_keys?: { access_url: string; expires_at: string; status: string }[] | { access_url: string; expires_at: string; status: string } | null;
};

const money = (amount: number) => new Intl.NumberFormat("en-US").format(amount) + " Ks";
const statusLabel: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  payment_submitted: "Payment under review",
  approved: "Approval in progress",
  fulfilled: "Key issued",
  rejected: "Payment rejected",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function Home() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServer, setSelectedServer] = useState<ServerItem | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"KBZPay" | "AYAPay">("KBZPay");
  const [order, setOrder] = useState<{ id: string; package_name_snapshot: string; duration_days_snapshot: number; price_mmk: number; status: string } | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [initData, setInitData] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadOrders = useCallback(async (rawInitData: string) => {
    if (!rawInitData) return;
    try {
      const response = await fetch("/api/orders", { headers: { "x-telegram-init-data": rawInitData }, cache: "no-store" });
      const data = await response.json();
      if (response.ok) setOrders(data.orders ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    const rawInitData = window.Telegram?.WebApp?.initData ?? "";
    setInitData(rawInitData);
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    fetch("/api/servers", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Servers could not be loaded."); setServers(data.servers ?? []); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Servers could not be loaded."));
    fetch("/api/packages", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Packages could not be loaded.");
        setPackages(data.packages ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Packages could not be loaded."))
      .finally(() => setLoading(false));
    if (rawInitData) void loadOrders(rawInitData);
  }, [loadOrders]);

  async function createOrder() {
    if (!selectedPackage || !selectedServer) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": initData },
        body: JSON.stringify({ packageId: selectedPackage.id, paymentProvider, serverId: selectedServer.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create order.");
      setOrder(data.order);
      setPayment(data.payment);
      setScreenshot(null);
      setMessage("Order created. Complete the transfer, then upload your screenshot.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create order.");
    } finally { setBusy(false); }
  }

  async function submitProof() {
    if (!order || !screenshot) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.append("screenshot", screenshot);
      form.append("provider", paymentProvider);
      const response = await fetch(`/api/orders/${order.id}/payment`, {
        method: "POST", headers: { "x-telegram-init-data": initData }, body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit screenshot.");
      setOrder({ ...order, status: "payment_submitted" });
      setMessage("Payment screenshot submitted. The admin will review it in Telegram.");
      setScreenshot(null);
      await loadOrders(initData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit screenshot.");
    } finally { setBusy(false); }
  }

  async function refreshOrders() { setError(""); await loadOrders(initData); }

  return (
    <main className="page-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="JBE Outline VPN home">
          <span className="brand-mark">J</span><span>JBE <b>OUTLINE</b></span>
        </Link>
        <span className="status-pill"><i /> VPN ACCESS</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> PRIVATE CONNECTION, MADE SIMPLE</p>
          <h1>Your connection.<br /><em>Your control.</em></h1>
          <p className="hero-description">Choose an Outline VPN package, transfer with KBZPay or AYA Pay, and receive your access key after payment verification.</p>
          <a className="primary-button" href="#packages">Explore packages <span aria-hidden="true">↗</span></a>
          <p className="microcopy">Secure checkout · Human-verified payment · Private access key</p>
        </div>
        <div className="orbital-art" aria-label="Abstract illustration of a secure connection" role="img">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
          <div className="core"><span>J</span><i>✦</i></div>
          <span className="satellite satellite-one">⌁</span><span className="satellite satellite-two">✳</span><span className="satellite satellite-three">↗</span>
          <div className="art-caption"><span className="pulse-dot" /> CONNECTION, REIMAGINED</div>
        </div>
      </section>

      {!initData && <div className="notice">For secure ordering, open this page from the JBE Outline VPN Telegram Mini App. Browsing packages is available here, but orders require Telegram.</div>}

      <section className="packages-panel">
        <div className="section-heading"><div><p className="eyebrow">01 / SERVER</p><h2>Choose your server</h2><p className="panel-note">Select a region and check the remaining stock before ordering.</p></div><span className="step-tag">STEP 1</span></div>
        {servers.length === 0 ? <p className="panel-note">Server options are temporarily unavailable. Please refresh in a moment.</p> : <div className="package-grid">{servers.map((server) => <button type="button" key={server.id} disabled={!server.available} className={selectedServer?.id === server.id ? "package-card selected" : "package-card"} onClick={() => { setSelectedServer(server); setOrder(null); setPayment(null); setError(""); setMessage(""); }}><span className="package-mark">⌁</span><strong>{server.name}</strong><span className="package-description">Region: {server.region}</span><span className="package-duration">{server.stock} available</span><span className="package-select">{!server.available ? "OUT OF STOCK" : selectedServer?.id === server.id ? "SELECTED ✓" : "SELECT SERVER ↗"}</span></button>)}</div>}
      </section>

      <section id="packages" className="packages-panel">
        <div className="section-heading">
          <div><p className="eyebrow">02 / PACKAGES</p><h2>Choose your connection</h2><p className="panel-note">Select the plan that fits your needs.</p></div>
          <span className="step-tag">STEP 1</span>
        </div>
        {loading ? <p className="panel-note">Loading available packages…</p> : packages.length === 0 ? (
          <div className="empty-state"><span className="placeholder-icon">＋</span><div><b>Packages are being configured</b><p>Available plans will appear here once the admin adds package prices.</p></div></div>
        ) : (
          <div className="package-grid">
            {packages.map((item) => <button type="button" className={selectedPackage?.id === item.id ? "package-card selected" : "package-card"} key={item.id} onClick={() => { setSelectedPackage(item); setOrder(null); setPayment(null); setError(""); setMessage(""); }}>
              <span className="package-mark">◈</span><strong>{item.name}</strong><span className="package-description">{item.description || "Private Outline VPN access"}</span>
              <span className="package-duration">{item.duration_days} days</span><span className="package-price">{money(item.price_mmk)}</span>
              <span className="package-select">{selectedPackage?.id === item.id ? "SELECTED ✓" : "SELECT PLAN ↗"}</span>
            </button>)}
          </div>
        )}
      </section>

      <section className="checkout-panel">
        <div className="section-heading">
          <div><p className="eyebrow">03 / CHECKOUT</p><h2>Payment details</h2><p className="panel-note">Choose a payment method to create your order.</p></div>
          <span className="step-tag">STEP 2</span>
        </div>
        <div className="payment-options">
          <button type="button" className={paymentProvider === "KBZPay" ? "payment-option selected" : "payment-option"} onClick={() => { setPaymentProvider("KBZPay"); setOrder(null); setPayment(null); }}>KBZPay <span>Mobile wallet</span></button>
          <button type="button" className={paymentProvider === "AYAPay" ? "payment-option selected" : "payment-option"} onClick={() => { setPaymentProvider("AYAPay"); setOrder(null); setPayment(null); }}>AYA Pay <span>Mobile wallet</span></button>
        </div>
        {selectedPackage && !order && <div className="order-summary"><div><span>Selected server</span><b>{selectedServer ? selectedServer.name + " · " + selectedServer.region + " · " + selectedServer.stock + " available" : "Choose a server above"}</b><span>Selected package</span><b>{selectedPackage.name} · {selectedPackage.duration_days} days</b></div><strong>{money(selectedPackage.price_mmk)}</strong></div>}
        {!order && <button className="primary-button wide-button" disabled={!selectedPackage || !selectedServer || !selectedServer.available || !initData || busy} onClick={createOrder}>{busy ? "Creating order…" : "Create order & show payment details"} <span>↗</span></button>}
        {order && payment && <div className="payment-details">
          <div className="order-created"><span className="success-mark">✓</span><div><b>Order created</b><p>Reference: <code>{order.id}</code></p></div></div>
          <div className="bank-card"><span className="bank-label">{payment.provider}</span><span className="bank-name">{payment.account_name}</span><div className="account-number">{payment.account_number}</div><button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(payment.account_number); setMessage("Payment account number copied."); }}>Copy account number</button>{payment.instructions && <p>{payment.instructions}</p>}<div className="amount-line"><span>Transfer amount</span><b>{money(order.price_mmk)}</b></div></div>
          {order.status === "awaiting_payment" ? <div className="upload-box"><label htmlFor="payment-proof">Upload payment screenshot</label><input id="payment-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)} /><p>JPG, PNG or WEBP · Up to 5 MB</p><button className="primary-button wide-button" disabled={!screenshot || busy} onClick={submitProof}>{busy ? "Submitting…" : "Submit payment proof"} <span>↗</span></button></div> : <p className="review-status">Payment proof submitted. Your order is waiting for admin review.</p>}
        </div>}
        {error && <p className="feedback error" role="alert">{error}</p>}
        {message && <p className="feedback success" role="status">{message}</p>}
      </section>

      <section className="history-panel">
        <div className="section-heading">
          <div><p className="eyebrow">03 / MY ORDERS</p><h2>Your access keys</h2><p className="panel-note">Only orders linked to your Telegram account appear here.</p></div>
          <button className="refresh-button" onClick={refreshOrders} disabled={!initData}>Refresh ↻</button>
        </div>
        {!initData ? <p className="panel-note">Open this Mini App in Telegram to view your orders.</p> : orders.length === 0 ? <div className="empty-state"><span className="placeholder-icon">⌁</span><div><b>No orders yet</b><p>Your orders and issued keys will appear here.</p></div></div> : <div className="order-list">{orders.map((item) => {
          const rawKey = item.outline_vpn_keys;
          const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
          return <article className="order-card" key={item.id}><div className="order-card-top"><div><b>{item.package_name_snapshot}</b><p>{item.duration_days_snapshot} days · {money(item.price_mmk)}</p></div><span className={item.status === "fulfilled" ? "order-status good" : "order-status"}>{statusLabel[item.status] ?? item.status}</span></div>
            {key?.access_url && <div className="issued-key"><span>OUTLINE ACCESS KEY</span><code>{key.access_url}</code><button className="copy-button" onClick={() => { void navigator.clipboard?.writeText(key.access_url); setMessage("Access key copied. Keep it private."); }}>Copy key</button><p>Expires: {new Date(key.expires_at).toLocaleString("en-GB", { timeZone: "Asia/Yangon" })} Myanmar time</p></div>}
            <p className="order-reference">Order ID: {item.id}</p></article>;
        })}</div>}
      </section>

      <section className="feature-grid" aria-label="Service features">
        <article className="feature-card"><span className="feature-number">01</span><span className="feature-icon">◈</span><h2>Private by design</h2><p>Your access key is shown only to your Telegram account.</p></article>
        <article className="feature-card"><span className="feature-number">02</span><span className="feature-icon">↗</span><h2>Simple setup</h2><p>Connect using the official Outline app.</p></article>
        <article className="feature-card"><span className="feature-number">03</span><span className="feature-icon">✓</span><h2>Human verified</h2><p>Payment is checked before a key is issued.</p></article>
      </section>
      <footer className="footer"><span>© {new Date().getFullYear()} JBE Outline VPN</span><span>Powered by Outline · <Link className="footer-admin" href="/admin">Admin settings ↗</Link></span></footer>
    </main>
  );
}
