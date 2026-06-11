import React from "react";


const styles = {
  shell: { minHeight: "100vh", background: "#05070a", color: "#f8fafc", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", padding: "32px 18px" },
  page: { maxWidth: 920, margin: "0 auto", border: "1px solid rgba(250,204,21,.28)", background: "rgba(255,255,255,.045)", padding: "28px", boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
  eyebrow: { color: "#facc15", letterSpacing: ".16em", textTransform: "uppercase" as const, fontSize: 12 },
  h1: { fontSize: "clamp(34px, 5vw, 58px)", lineHeight: .95, margin: "8px 0 18px", textShadow: "3px 3px 0 #7f1d1d" },
  p: { color: "rgba(248,250,252,.78)", lineHeight: 1.7 },
  li: { color: "rgba(248,250,252,.78)", lineHeight: 1.7, marginBottom: 8 },
  link: { color: "#facc15", textDecoration: "none" },
  nav: { display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 24 },
  chip: { color: "#fef3c7", textDecoration: "none", border: "1px solid rgba(250,204,21,.28)", padding: "8px 10px", background: "rgba(250,204,21,.08)" },
};

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={styles.shell}>
      <article style={styles.page}>
        <nav style={styles.nav}>
          <a style={styles.chip} href="../">Game</a>
          <a style={styles.chip} href="../terms/">Terms</a>
          <a style={styles.chip} href="../privacy/">Privacy</a>
          <a style={styles.chip} href="../responsible-gaming/">Responsible Play</a>
          <a style={styles.chip} href="../contact/">Contact</a>
        </nav>
        <p style={styles.eyebrow}>Shrimo Innovations · Tankar Battle</p>
        <h1 style={styles.h1}>{title}</h1>
        {children}
        <p style={styles.p}>Last updated: 11 June 2026</p>
      </article>
    </main>
  );
}

export default function Page() {
  return (
    <LegalLayout title="Terms of Use">

        <p style={styles.p}>By playing Tankar Battle, you agree to use the game only for lawful, personal, entertainment purposes.</p>
        <ul>
          <li style={styles.li}>This is a free arcade game. It is not gambling, betting, wagering, fantasy money gaming, lottery, casino, or real-money gaming.</li>
          <li style={styles.li}>No money, prize, withdrawal, trading value, or redeemable reward is offered through gameplay.</li>
          <li style={styles.li}>Do not copy, resell, reverse engineer, abuse, attack, or misrepresent the game or Shrimo Innovations branding.</li>
          <li style={styles.li}>Gameplay may contain arcade shooting, explosions, and competitive survival mechanics. Player discretion is advised.</li>
          <li style={styles.li}>The game is provided as-is. Availability, compatibility, and uninterrupted play are not guaranteed.</li>
        </ul>

    </LegalLayout>
  );
}
