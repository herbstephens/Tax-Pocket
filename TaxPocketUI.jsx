import { useState, useMemo } from "react";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ACCRUALS = [
  {
    id: "acc_001", jurisdictionId: "PT-11", token: "USDC",
    grossAmount: 6.00, netAmount: 6.00,
    accruedAt: Date.now() / 1000 - 86400 * 5,
    merchantName: "Café Lisboa", txHash: "0xabc...001",
    state: "pending",
  },
  {
    id: "acc_002", jurisdictionId: "PT", token: "USDC",
    grossAmount: 2.25, netAmount: 2.25,
    accruedAt: Date.now() / 1000 - 86400 * 5,
    merchantName: "Café Lisboa", txHash: "0xabc...001",
    state: "pending",
  },
  {
    id: "acc_003", jurisdictionId: "GLOBAL", token: "USDC",
    grossAmount: 0.75, netAmount: 0.75,
    accruedAt: Date.now() / 1000 - 86400 * 5,
    merchantName: "Café Lisboa", txHash: "0xabc...001",
    state: "pending",
  },
  {
    id: "acc_004", jurisdictionId: "PT-11", token: "USDC",
    grossAmount: 12.00, netAmount: 12.00,
    accruedAt: Date.now() / 1000 - 86400 * 12,
    merchantName: "SuperCentro Lisboa", txHash: "0xabc...002",
    state: "confirmed",
  },
  {
    id: "acc_005", jurisdictionId: "PT", token: "USDC",
    grossAmount: 4.50, netAmount: 4.50,
    accruedAt: Date.now() / 1000 - 86400 * 12,
    merchantName: "SuperCentro Lisboa", txHash: "0xabc...002",
    state: "confirmed",
  },
  {
    id: "acc_006", jurisdictionId: "PT-11", token: "USDC",
    grossAmount: 3.00, netAmount: 0.00,
    accruedAt: Date.now() / 1000 - 86400 * 8,
    merchantName: "Restaurant Fado (VOIDED)", txHash: "0xabc...003",
    state: "voided",
  },
];

const JURISDICTION_META = {
  "PT-11": { name: "Lisbon", country: "PT", flag: "🇵🇹", layer: "Local" },
  "PT":    { name: "Portugal", country: "PT", flag: "🇵🇹", layer: "National" },
  "DE-BE": { name: "Berlin", country: "DE", flag: "🇩🇪", layer: "Regional" },
  "US-CA": { name: "California", country: "US", flag: "🇺🇸", layer: "State" },
  "GLOBAL":{ name: "Commons", country: "", flag: "🌐", layer: "Global" },
};

const SCHEDULE_OPTIONS = [
  { value: "monthly",   label: "Monthly",   desc: "Remit on last day of each month" },
  { value: "quarterly", label: "Quarterly", desc: "Remit every 3 months (recommended)" },
  { value: "annual",    label: "Annual",    desc: "Remit once per year" },
  { value: "on_demand", label: "On-Demand", desc: "Only remit when you choose" },
];

function fmt(n) {
  return n.toFixed(2);
}

function timeAgo(ts) {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function daysUntil(ts) {
  const days = Math.ceil((ts - Date.now() / 1000) / 86400);
  if (days <= 0) return { label: "OVERDUE", color: "#ef4444" };
  if (days <= 7) return { label: `${days}d`, color: "#f59e0b" };
  return { label: `${days}d`, color: "#6b7280" };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Tab({ label, active, onClick, badge }) {
  return (
    <button
      style={{
        ...s.tab,
        ...(active ? s.tabActive : {}),
      }}
      onClick={onClick}
    >
      {label}
      {badge > 0 && <span style={s.tabBadge}>{badge}</span>}
    </button>
  );
}

function StatusPill({ state }) {
  const colors = {
    pending:   { bg: "#172554", text: "#93c5fd", border: "#1e40af" },
    confirmed: { bg: "#1c1917", text: "#d6b87a", border: "#78350f" },
    committed: { bg: "#14532d", text: "#86efac", border: "#166534" },
    remitted:  { bg: "#052e16", text: "#4ade80", border: "#15803d" },
    voided:    { bg: "#1f2937", text: "#6b7280", border: "#374151" },
  };
  const c = colors[state] || colors.pending;
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 100,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    }}>
      {state}
    </span>
  );
}

function BalanceSummary({ accruals, nextDue }) {
  const totals = useMemo(() => {
    const byJurisdiction = {};
    let pending = 0, confirmed = 0;
    for (const a of accruals) {
      if (a.state === "voided" || a.state === "remitted") continue;
      if (!byJurisdiction[a.jurisdictionId]) {
        byJurisdiction[a.jurisdictionId] = { pending: 0, confirmed: 0 };
      }
      if (a.state === "pending") {
        byJurisdiction[a.jurisdictionId].pending += a.netAmount;
        pending += a.netAmount;
      } else if (a.state === "confirmed" || a.state === "committed") {
        byJurisdiction[a.jurisdictionId].confirmed += a.netAmount;
        confirmed += a.netAmount;
      }
    }
    return { byJurisdiction, pending, confirmed, total: pending + confirmed };
  }, [accruals]);

  const due = daysUntil(nextDue);

  return (
    <div>
      {/* Total Balance Card */}
      <div style={s.balanceCard}>
        <div style={s.balanceTop}>
          <div>
            <div style={s.balanceLabel}>Tax Pocket Balance</div>
            <div style={s.balanceAmount}>{fmt(totals.total)} USDC</div>
            <div style={s.balanceSub}>Self-custody · Your keys · Your funds</div>
          </div>
          <div style={s.dueBox}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Next due</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: due.color }}>{due.label}</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>Mar 31, 2026</div>
          </div>
        </div>

        {/* Pending vs Confirmed bar */}
        <div style={s.splitBar}>
          <div style={{ ...s.splitSegment, background: "#1d4ed8", flex: totals.pending || 0.01 }} />
          <div style={{ ...s.splitSegment, background: "#d97706", flex: totals.confirmed || 0.01 }} />
        </div>
        <div style={s.splitLegend}>
          <span><span style={{ color: "#3b82f6" }}>●</span> Pending {fmt(totals.pending)} USDC</span>
          <span><span style={{ color: "#d97706" }}>●</span> Confirmed {fmt(totals.confirmed)} USDC</span>
        </div>
      </div>

      {/* Per-Jurisdiction Breakdown */}
      <div style={s.sectionLabel}>By Jurisdiction</div>
      {Object.entries(totals.byJurisdiction).map(([jId, bal]) => {
        const meta = JURISDICTION_META[jId] || { flag: "📍", name: jId, layer: "" };
        const total = bal.pending + bal.confirmed;
        return (
          <div key={jId} style={s.jRow}>
            <div style={s.jLeft}>
              <span style={{ fontSize: 20 }}>{meta.flag}</span>
              <div>
                <div style={s.jName}>{meta.flag} {jId} <span style={s.jLayer}>{meta.layer}</span></div>
                <div style={s.jSub}>
                  <span style={{ color: "#3b82f6" }}>{fmt(bal.pending)} pending</span>
                  {" · "}
                  <span style={{ color: "#d97706" }}>{fmt(bal.confirmed)} confirmed</span>
                </div>
              </div>
            </div>
            <div style={s.jAmount}>{fmt(total)} USDC</div>
          </div>
        );
      })}

      {/* Yield note */}
      <div style={s.yieldNote}>
        <span>💡</span>
        <span>Your Tax Pocket is earning yield while funds wait. Enable in Settings →</span>
      </div>
    </div>
  );
}

function AccrualList({ accruals, onReconcile }) {
  const active = accruals.filter(a => a.state !== "voided" && a.state !== "remitted");
  const voided = accruals.filter(a => a.state === "voided");

  return (
    <div>
      <div style={s.sectionLabel}>Active Accruals ({active.length})</div>
      {active.map(a => {
        const meta = JURISDICTION_META[a.jurisdictionId] || { flag: "📍", name: a.jurisdictionId };
        return (
          <div key={a.id} style={s.accrualRow}>
            <div style={s.accrualLeft}>
              <div style={s.accrualJurisdiction}>{meta.flag} {a.jurisdictionId}</div>
              <div style={s.accrualMerchant}>{a.merchantName} · {timeAgo(a.accruedAt)}</div>
              <div style={s.accrualTx}>{a.txHash}</div>
            </div>
            <div style={s.accrualRight}>
              <div style={s.accrualAmount}>{fmt(a.netAmount)} USDC</div>
              <StatusPill state={a.state} />
              {a.state !== "voided" && (
                <button style={s.voidBtn} onClick={() => onReconcile(a.id, "void")}>
                  void
                </button>
              )}
            </div>
          </div>
        );
      })}

      {voided.length > 0 && (
        <>
          <div style={{ ...s.sectionLabel, marginTop: 20 }}>Voided ({voided.length})</div>
          {voided.map(a => (
            <div key={a.id} style={{ ...s.accrualRow, opacity: 0.4 }}>
              <div style={s.accrualLeft}>
                <div style={s.accrualJurisdiction}>{a.jurisdictionId}</div>
                <div style={s.accrualMerchant}>{a.merchantName}</div>
              </div>
              <div style={s.accrualRight}>
                <div style={{ ...s.accrualAmount, textDecoration: "line-through" }}>
                  {fmt(a.grossAmount)} USDC
                </div>
                <StatusPill state="voided" />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function RemitPanel({ accruals, onRemit }) {
  const [confirming, setConfirming] = useState(false);

  const remittable = useMemo(() => {
    const byJ = {};
    for (const a of accruals) {
      if (a.state !== "confirmed" && a.state !== "committed") continue;
      if (!byJ[a.jurisdictionId]) byJ[a.jurisdictionId] = 0;
      byJ[a.jurisdictionId] += a.netAmount;
    }
    return byJ;
  }, [accruals]);

  const total = Object.values(remittable).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🟢</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Nothing to remit</div>
        <div style={{ color: "#4b5563", fontSize: 13 }}>
          All confirmed liabilities have been paid.
          Pending accruals will move to confirmed at period end.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={s.sectionLabel}>Ready to Remit</div>
      <div style={s.remitCard}>
        <div style={s.remitHeader}>
          <span style={{ fontSize: 24 }}>🏛️</span>
          <div>
            <div style={{ fontWeight: 700 }}>Quarterly Remittance</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Q1 2026 · Due March 31</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb" }}>{fmt(total)} USDC</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>total</div>
          </div>
        </div>

        {Object.entries(remittable).map(([jId, amount]) => {
          const meta = JURISDICTION_META[jId] || { flag: "📍", name: jId };
          return (
            <div key={jId} style={s.remitRow}>
              <span>{meta.flag} {jId}</span>
              <span style={{ color: "#4ade80", fontWeight: 600 }}>{fmt(amount)} USDC → vault</span>
            </div>
          );
        })}

        <div style={s.remitNote}>
          Funds will be sent to verified jurisdiction vaults on World Chain.
          A receipt NFT will be minted as proof of payment.
        </div>

        {!confirming ? (
          <button style={s.remitBtn} onClick={() => setConfirming(true)}>
            Remit {fmt(total)} USDC →
          </button>
        ) : (
          <div>
            <div style={s.remitConfirm}>
              Are you sure? This will send {fmt(total)} USDC to jurisdiction vaults.
              This action is irreversible.
            </div>
            <div style={s.actions}>
              <button style={s.cancelBtn} onClick={() => setConfirming(false)}>Cancel</button>
              <button style={s.confirmBtn} onClick={() => { onRemit(remittable); setConfirming(false); }}>
                Confirm Remittance
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SchedulePanel({ schedule, onUpdate }) {
  return (
    <div>
      <div style={s.sectionLabel}>Remittance Schedule</div>
      {SCHEDULE_OPTIONS.map(opt => (
        <div
          key={opt.value}
          style={{
            ...s.scheduleRow,
            ...(schedule === opt.value ? s.scheduleRowActive : {}),
          }}
          onClick={() => onUpdate(opt.value)}
        >
          <div style={s.scheduleRadio}>
            <div style={{
              ...s.radioInner,
              background: schedule === opt.value ? "#3b82f6" : "transparent",
            }} />
          </div>
          <div>
            <div style={s.scheduleLabel}>{opt.label}</div>
            <div style={s.scheduleSub}>{opt.desc}</div>
          </div>
        </div>
      ))}

      <div style={{ ...s.sectionLabel, marginTop: 24 }}>Yield on Tax Pocket</div>
      <div style={s.yieldCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Earn while you wait</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              Your Tax Pocket earns ~4.2% APY via T-bill yield tokens
            </div>
          </div>
          <div style={s.toggle}>OFF</div>
        </div>
        <div style={{ fontSize: 11, color: "#374151", marginTop: 10, lineHeight: 1.5 }}>
          You keep 100% of yield. The government gets the principal on remittance date.
          This inverts the current withholding system.
        </div>
      </div>

      <div style={{ ...s.sectionLabel, marginTop: 24 }}>On-Chain Commitment</div>
      <div style={s.onchainCard}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Deploy TaxPocket.sol</div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
          Optional: lock your confirmed tax liability into a smart contract.
          Creates auditable proof of reserves. Useful for businesses and
          regulatory compliance.
        </div>
        <button style={s.deployBtn}>Deploy On-Chain Pocket →</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function TaxPocketApp() {
  const [tab, setTab] = useState("balance");
  const [accruals, setAccruals] = useState(MOCK_ACCRUALS);
  const [schedule, setSchedule] = useState("quarterly");
  const [remitted, setRemitted] = useState(false);

  const nextDue = Date.now() / 1000 + 86400 * 21;

  const counts = {
    balance:  accruals.filter(a => a.state !== "voided" && a.state !== "remitted").length,
    accruals: accruals.filter(a => a.state === "pending").length,
    remit:    accruals.filter(a => a.state === "confirmed" || a.state === "committed").length,
  };

  const handleReconcile = (id, reason) => {
    setAccruals(prev => prev.map(a =>
      a.id === id ? { ...a, state: "voided", netAmount: 0 } : a
    ));
  };

  const handleRemit = (remittable) => {
    setAccruals(prev => prev.map(a =>
      (a.state === "confirmed" || a.state === "committed") && remittable[a.jurisdictionId]
        ? { ...a, state: "remitted" }
        : a
    ));
    setRemitted(true);
    setTimeout(() => setRemitted(false), 3000);
  };

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>🏛️ Tax Pocket</div>
          <div style={s.headerSub}>herb.eth · Self-Custody Tax Escrow</div>
        </div>
        <div style={s.headerBadge}>SELF-CUSTODY</div>
      </div>

      {remitted && (
        <div style={s.successBanner}>
          ✅ Remittance sent · Receipt NFT minted
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        <Tab label="Balance"  active={tab === "balance"}  onClick={() => setTab("balance")}  badge={0} />
        <Tab label="Accruals" active={tab === "accruals"} onClick={() => setTab("accruals")} badge={counts.accruals} />
        <Tab label="Remit"    active={tab === "remit"}    onClick={() => setTab("remit")}    badge={counts.remit} />
        <Tab label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} badge={0} />
      </div>

      {/* Content */}
      <div style={s.content}>
        {tab === "balance"  && <BalanceSummary accruals={accruals} nextDue={nextDue} />}
        {tab === "accruals" && <AccrualList accruals={accruals} onReconcile={handleReconcile} />}
        {tab === "remit"    && <RemitPanel accruals={accruals} onRemit={handleRemit} />}
        {tab === "settings" && <SchedulePanel schedule={schedule} onUpdate={setSchedule} />}
      </div>

      <div style={s.footer}>
        github.com/global-tax-clearinghouse · GPL-3.0
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = {
  app: {
    minHeight: "100vh",
    background: "#030712",
    color: "#f9fafb",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  header: {
    width: "100%",
    maxWidth: 480,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 24px 16px",
    borderBottom: "1px solid #111827",
  },
  headerTitle: { fontSize: 18, fontWeight: 800 },
  headerSub: { fontSize: 11, color: "#4b5563", marginTop: 3 },
  headerBadge: {
    fontSize: 10, padding: "4px 10px", borderRadius: 100,
    background: "#052e16", color: "#4ade80",
    border: "1px solid #166534", fontWeight: 700, letterSpacing: 1,
  },
  successBanner: {
    width: "100%",
    maxWidth: 480,
    background: "#052e16",
    borderBottom: "1px solid #166534",
    color: "#4ade80",
    padding: "10px 24px",
    fontSize: 13,
    fontWeight: 600,
  },
  tabs: {
    display: "flex",
    width: "100%",
    maxWidth: 480,
    borderBottom: "1px solid #111827",
  },
  tab: {
    flex: 1,
    padding: "12px 0",
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderBottom: "2px solid transparent",
    transition: "all 0.15s",
  },
  tabActive: {
    color: "#f9fafb",
    borderBottomColor: "#3b82f6",
  },
  tabBadge: {
    background: "#1d4ed8",
    color: "#fff",
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 100,
    fontWeight: 700,
  },
  content: {
    width: "100%",
    maxWidth: 480,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  sectionLabel: {
    fontSize: 10,
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 4,
  },
  balanceCard: {
    background: "#0a0f1a",
    border: "1px solid #1e3a5f",
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
  },
  balanceTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 11, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1 },
  balanceAmount: { fontSize: 28, fontWeight: 800, marginTop: 4 },
  balanceSub: { fontSize: 11, color: "#166534", marginTop: 4 },
  dueBox: { textAlign: "right" },
  splitBar: {
    display: "flex",
    height: 6,
    borderRadius: 100,
    overflow: "hidden",
    gap: 2,
    marginBottom: 8,
  },
  splitSegment: { height: "100%", borderRadius: 100, minWidth: 4 },
  splitLegend: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#6b7280",
  },
  jRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #111827",
  },
  jLeft: { display: "flex", alignItems: "center", gap: 10 },
  jName: { fontSize: 13, fontWeight: 600 },
  jLayer: { fontSize: 11, color: "#4b5563", fontWeight: 400 },
  jSub: { fontSize: 11, marginTop: 2 },
  jAmount: { fontSize: 14, fontWeight: 700 },
  yieldNote: {
    display: "flex",
    gap: 8,
    marginTop: 16,
    padding: 12,
    background: "#0a1628",
    borderRadius: 8,
    fontSize: 12,
    color: "#4b5563",
    border: "1px solid #1e3a5f",
    cursor: "pointer",
  },
  accrualRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #111827",
    gap: 10,
  },
  accrualLeft: { flex: 1 },
  accrualJurisdiction: { fontSize: 13, fontWeight: 600 },
  accrualMerchant: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  accrualTx: { fontSize: 10, color: "#374151", marginTop: 1 },
  accrualRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  accrualAmount: { fontSize: 13, fontWeight: 700 },
  voidBtn: {
    background: "none", border: "1px solid #374151", borderRadius: 4,
    color: "#6b7280", fontSize: 10, padding: "2px 8px", cursor: "pointer",
    fontFamily: "inherit",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 0",
    color: "#6b7280",
  },
  remitCard: {
    background: "#0a0f1a",
    border: "1px solid #1e3a5f",
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  remitHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  remitRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    padding: "6px 0",
    borderBottom: "1px solid #111827",
  },
  remitNote: {
    fontSize: 11,
    color: "#4b5563",
    lineHeight: 1.6,
    borderTop: "1px solid #1f2937",
    paddingTop: 10,
  },
  remitConfirm: {
    background: "#1c0a0a",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: "#fca5a5",
    marginBottom: 12,
    lineHeight: 1.5,
  },
  remitBtn: {
    width: "100%",
    padding: "12px 0",
    border: "none",
    borderRadius: 8,
    background: "linear-gradient(135deg, #1d4ed8, #1e40af)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
  },
  scheduleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #1f2937",
    marginBottom: 8,
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  scheduleRowActive: {
    borderColor: "#1d4ed8",
    background: "#0c1a3d",
  },
  scheduleRadio: {
    width: 16, height: 16, borderRadius: "50%",
    border: "2px solid #374151",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  radioInner: {
    width: 8, height: 8, borderRadius: "50%",
    transition: "background 0.15s",
  },
  scheduleLabel: { fontSize: 13, fontWeight: 600 },
  scheduleSub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  yieldCard: {
    background: "#0a1628",
    border: "1px solid #1e3a5f",
    borderRadius: 8,
    padding: 14,
  },
  toggle: {
    padding: "4px 12px",
    borderRadius: 100,
    background: "#1f2937",
    color: "#6b7280",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  onchainCard: {
    background: "#0a0f1a",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: 14,
  },
  deployBtn: {
    marginTop: 12,
    padding: "8px 16px",
    background: "none",
    border: "1px solid #374151",
    borderRadius: 6,
    color: "#9ca3af",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  actions: { display: "flex", gap: 10 },
  cancelBtn: {
    flex: 1, padding: "10px 0",
    border: "1px solid #374151", borderRadius: 8,
    background: "transparent", color: "#9ca3af",
    cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  },
  confirmBtn: {
    flex: 2, padding: "10px 0",
    border: "none", borderRadius: 8,
    background: "#1d4ed8", color: "#fff",
    cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  },
  footer: {
    fontSize: 10, color: "#1f2937",
    padding: "20px 0",
  },
};
