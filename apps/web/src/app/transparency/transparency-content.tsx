// Transparency page — Schrems II evidence pack + sub-processor inventory.
//
// The README, SECURITY.md, and CRYPTO.md already make the
// EU-jurisdiction claim. This page is the user-facing surface that
// formalises it into an auditable artefact: who operates the service,
// where the bytes physically live, what cookies / trackers / third
// parties touch a session, and how to verify each claim from the
// outside.
//
// All content is static-by-design — no fetches, no JS-required render
// path beyond the i18n switch. A visitor with JS disabled still sees
// the English text because the i18n provider falls back to the
// `lang="en"` document attribute when its localStorage hydration
// hasn't run yet.

"use client";

import * as React from "react";

export function TransparencyContent() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Transparency
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-[var(--color-fg)] sm:text-4xl">
          Where the bytes go, and who can see them.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Last updated 2026-05-11. Snapshot of the v0.2.0-alpha production deployment.
        </p>
      </header>

      <Section title="Operator">
        <Row label="Legal entity">Philip Sloth (sole proprietor, Denmark · EU)</Row>
        <Row label="Domain">slothbox.philipsloth.com</Row>
        <Row label="Contact (incl. GDPR)">
          <a
            href="mailto:philipsloth1@gmail.com"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            philipsloth1@gmail.com
          </a>
        </Row>
        <Row label="Source code">
          <a
            href="https://github.com/SloThdk/slothbox"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            github.com/SloThdk/slothbox
          </a>{" "}
          (MIT-licensed, public commit history)
        </Row>
      </Section>

      <Section title="Where the bytes physically live">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Every byte of every share — ciphertext, metadata, audit-chain entries, logs — sits on a
          single Linux VM in <strong>Falkenstein FSN1, Germany</strong>, leased from{" "}
          <strong>Hetzner Online GmbH</strong>. Hetzner is a wholly EU-incorporated company
          (Gunzenhausen, Bavaria) with no US parent — there is no US CLOUD Act exposure that AWS
          Frankfurt or Azure Germany retain via their US-incorporated ultimate owners.
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          DNS for slothbox.philipsloth.com points straight at the VM&apos;s public IP (Cloudflare is
          configured as <em>DNS-only</em>, NOT proxied — no Cloudflare edge sits in the data path).
          TLS terminates inside the VM at <strong>Caddy 2.8</strong> with Let&apos;s Encrypt
          certificates issued via ACME HTTP-01. No US-jurisdiction CDN or WAF intermediates the
          bytes.
        </p>
      </Section>

      <Section title="Sub-processors">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Third parties that touch share data in the production data path:
        </p>
        <Table
          rows={[
            ["Hetzner Online GmbH", "Compute + storage (host)", "Germany · EU"],
            ["Let's Encrypt (ISRG)", "TLS certificate issuance only", "USA"],
          ]}
        />
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Let&apos;s Encrypt is a US-jurisdiction nonprofit but it sees ZERO share data — only the
          domain name during the ACME challenge. The certificate-issuance path does not transit
          ciphertext, plaintext, or metadata.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
          Third parties that touch <em>operator</em> data (not share data):
        </p>
        <Table
          rows={[
            ["GitHub (Microsoft)", "Source code hosting + CI runners", "USA"],
            ["Cloudflare DNS", "Authoritative DNS records for the domain", "USA"],
          ]}
        />
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          GitHub sees the open-source code (already public). Cloudflare DNS sees the A-record IP and
          resolver queries from visitors — same as any other authoritative DNS.
        </p>
      </Section>

      <Section title="Cookies, trackers, analytics">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Zero of each. No first-party cookies are set by the marketing pages, no analytics script
          ships in the bundle, no third-party tag manager runs. The only state we keep in your
          browser is what you opted into:
        </p>
        <ul className="list-disc pl-6 text-sm leading-relaxed text-[var(--color-muted)]">
          <li>
            <code className="font-mono text-xs">slothbox.myShares.v1</code> in localStorage — the
            list of shares this device created plus the 32-byte revoke token for each (see{" "}
            <a
              href="/my-shares"
              className="text-[var(--color-accent)] underline-offset-4 hover:underline"
            >
              /my-shares
            </a>
            ). Cleared on browser data wipe.
          </li>
          <li>
            Language preference under <code className="font-mono text-xs">slothbox.lang</code> —
            picked up from the UI&apos;s en/da toggle.
          </li>
        </ul>
      </Section>

      <Section title="Logs we keep">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Self-hosted observability stack (Prometheus, Grafana, Loki, Promtail) runs in the same VM.
          We log:
        </p>
        <ul className="list-disc pl-6 text-sm leading-relaxed text-[var(--color-muted)]">
          <li>Request method, path, status code, duration, request-id</li>
          <li>
            Hashed sender IP (SHA-256 truncated, for rate-limiting only — never the raw IP) on
            share-create
          </li>
          <li>
            Coarse sender region (e.g. &quot;EU-DK&quot;) on share-create, for receipt metadata
          </li>
          <li>Audit-chain events (share_created, share_destroyed, share_downloaded)</li>
        </ul>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Logs are retained 30 days (rolling), audit-chain entries forever (they&apos;re the
          tamper-evidence anchor — see{" "}
          <a
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            /security
          </a>
          ). Logs never contain plaintext content, decryption keys, passwords, or raw IPs.
        </p>
      </Section>

      <Section title="Audit status">
        <Table
          rows={[
            ["libsodium (browser primitives)", "Ongoing", "Audited upstream (NCC Group + others)"],
            ["age (asymmetric, v1.0+)", "2022", "Audited upstream (NCC Group)"],
            ["SlothBox integration code", "—", "Not yet — external review is a v1.0 hard gate"],
            ["API gateway authn/z + rate limit", "—", "Not yet pen-tested"],
            ["Postgres RLS policies", "—", "Not yet pen-tested"],
          ]}
        />
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Until v1.0 ships with the external integration audit under{" "}
          <code className="font-mono">/audits/</code>, SlothBox is suitable for portfolio review and
          personal experimentation only. The README and{" "}
          <a
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            SECURITY policy
          </a>{" "}
          preserve this gap explicitly.
        </p>
      </Section>

      <Section title="How to verify any of the above">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          The source is public — every claim on this page is grounded in something you can inspect:
        </p>
        <ul className="list-disc pl-6 font-mono text-xs leading-relaxed text-[var(--color-muted)]">
          <li>
            DNS: <code>dig slothbox.philipsloth.com A</code> — resolves to the Hetzner VM&apos;s
            public IP, not a Cloudflare edge
          </li>
          <li>
            TLS:{" "}
            <code>
              openssl s_client -connect slothbox.philipsloth.com:443 -servername
              slothbox.philipsloth.com
            </code>{" "}
            — issuer is Let&apos;s Encrypt ISRG Root, not Cloudflare
          </li>
          <li>
            Cookies on a fresh visit: <code>document.cookie</code> in DevTools — empty until you opt
            into <code>/my-shares</code>
          </li>
          <li>
            Sub-processor list:{" "}
            <a
              href="https://github.com/SloThdk/slothbox/blob/master/docker-compose.prod.yml"
              className="text-[var(--color-accent)] underline-offset-4 hover:underline"
            >
              <code>docker-compose.prod.yml</code>
            </a>{" "}
            lists every container in the data path
          </li>
        </ul>
      </Section>

      <footer className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-card)]/60 p-4 text-xs text-[var(--color-muted)]">
        <p className="leading-relaxed">
          <strong className="text-[var(--color-fg)]">Reporting a change.</strong> When a
          sub-processor or data-path element changes, this page is updated in the same commit as the
          operational change. The page&apos;s &quot;Last updated&quot; line ticks forward; the prior
          versions are visible in the source repo&apos;s git history.
        </p>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives — kept inline because they're only used here.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">{title}</h2>
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <span className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase sm:w-1/3">
        {label}
      </span>
      <span className="text-sm text-[var(--color-fg)]">{children}</span>
    </div>
  );
}

function Table({ rows }: { rows: ReadonlyArray<readonly [string, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]/60">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                i < rows.length - 1 ? "border-b border-[var(--color-border)]/60" : undefined
              }
            >
              <td className="p-2 align-top font-medium text-[var(--color-fg)] sm:p-3">{row[0]}</td>
              <td className="p-2 align-top text-[var(--color-muted)] sm:p-3">{row[1]}</td>
              <td className="p-2 align-top whitespace-nowrap text-[var(--color-muted)] sm:p-3">
                {row[2]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
