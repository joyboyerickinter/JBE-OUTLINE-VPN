"use client";

import { useState } from "react";

const features = [
  { icon: "◈", title: "Private by design", text: "Your access key is shown only to your account." },
  { icon: "↗", title: "Simple setup", text: "Connect with the official Outline app." },
  { icon: "✓", title: "Manual verification", text: "Payment is checked before a key is issued." },
];

export default function Home() {
  const [showPackages, setShowPackages] = useState(false);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="JBE Outline VPN home">
          <span className="brand-mark">J</span>
          <span>JBE <b>OUTLINE</b></span>
        </a>
        <span className="status-pill"><i /> VPN ACCESS</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> PRIVATE CONNECTION, MADE SIMPLE</p>
          <h1>Your connection.<br /><em>Your control.</em></h1>
          <p className="hero-description">
            Choose an Outline VPN package, submit your payment proof, and receive your access key after verification.
          </p>
          <button className="primary-button" onClick={() => setShowPackages((value) => !value)}>
            {showPackages ? "Hide packages" : "Explore packages"} <span aria-hidden="true">↗</span>
          </button>
          <p className="microcopy">Secure checkout · Human-verified payment</p>
        </div>

        <div className="orbital-art" aria-label="Abstract illustration of a secure connection" role="img">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="core"><span>J</span><i>✦</i></div>
          <span className="satellite satellite-one">⌁</span>
          <span className="satellite satellite-two">✳</span>
          <span className="satellite satellite-three">↗</span>
          <div className="art-caption"><span className="pulse-dot" /> CONNECTION, REIMAGINED</div>
        </div>
      </section>

      {showPackages && (
        <section className="packages-panel" aria-live="polite">
          <div>
            <p className="eyebrow">PACKAGES</p>
            <h2>Choose your connection</h2>
            <p className="panel-note">Package details and current prices will appear here once configured by the admin.</p>
          </div>
          <div className="package-placeholder">
            <span className="placeholder-icon">＋</span>
            <div><b>Packages are being prepared</b><p>Check back soon for available plans.</p></div>
          </div>
        </section>
      )}

      <section className="feature-grid" aria-label="Service features">
        {features.map((feature, index) => (
          <article className="feature-card" key={feature.title}>
            <span className="feature-number">0{index + 1}</span>
            <span className="feature-icon">{feature.icon}</span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} JBE Outline VPN</span>
        <span>Powered by Outline</span>
      </footer>
    </main>
  );
}
