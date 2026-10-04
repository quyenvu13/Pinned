import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRACT_ADDRESS, EXPLORER_BASE } from "./lib/config";
import { calldataBytes, CALLDATA_LIMIT } from "./lib/calldata";
import { errorMessage } from "./lib/errors";
import { connectedWallet, ensureStudioNet, getRounds, getTerm, requestWallet, sendWrite, waitForVerdict } from "./lib/genlayer";
import { short, termId } from "./lib/ids";
import { pyLen, pyStrip } from "./lib/pytext";
import {
  countersignBlock,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TEXT_LENGTH,
  openBlock,
  parseAmount,
  recordBlock,
  rejectBlock,
  roleOf,
  roundLine,
  signatureLine,
} from "./lib/rules";
import type { Round, Term, TxStatus } from "./lib/types";
import { countersignVerified, openVerified, recordVerified, rejectVerified } from "./lib/verify";

type Tab = "overview" | "open" | "inspect" | "compare";
type Loaded = { term: Term; rounds: Round[] };

const RECENT_KEY = "pinned.recent";

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* storage unavailable: the recent list is a convenience only */
  }
}

function cleanId(value: string): string {
  return pyStrip(value).toLowerCase().replace(/^0x/, "");
}

const validId = (v: string) => /^[0-9a-f]{64}$/.test(cleanId(v));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 1234567 -> "1,234,567" without going through a JS number. */
function groupDigits(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function load(id: string): Promise<Loaded | null> {
  const term = await getTerm(id);
  if (!term) return null;
  return { term, rounds: term.round_count > 0 ? await getRounds(id) : [] };
}

function Meter({ bytes }: { bytes: number }) {
  return (
    <span className={bytes > CALLDATA_LIMIT ? "meter over" : "meter"} title="GenLayer calldata; the RPC rejects more than 255 bytes">
      {bytes}/{CALLDATA_LIMIT} B
    </span>
  );
}

function Seals({ held, required }: { held: number; required: number }) {
  return (
    <span className="seals" aria-hidden="true">
      {Array.from({ length: required }, (_, i) => <i key={i} className={i < held ? "seal on" : "seal"} />)}
    </span>
  );
}

type CardProps = {
  data: Loaded;
  me: string;
  busy: boolean;
  onRecord: (t: Term, value: bigint) => Promise<void>;
  onCountersign: (t: Term) => Promise<void>;
  onReject: (t: Term, note: string) => Promise<void>;
};

function TermCard({ data, me, busy, onRecord, onCountersign, onReject }: CardProps) {
  const { term: t, rounds } = data;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const wallet = me || "0x" + "0".repeat(40);
  const noWallet = "Connect a wallet first";
  const recordReason = me ? recordBlock(t, wallet, amount) : noWallet;
  const signReason = me ? countersignBlock(t, wallet) : noWallet;
  const rejectReason = me ? rejectBlock(t, wallet, note) : noWallet;
  const role = me ? roleOf(t, me) : null;
  const pinned = t.certainty === "PINNED";
  const parsed = parseAmount(amount);
  const recordBytes = calldataBytes("record_amount", [t.term_id, parsed.ok ? parsed.value : 1n]);
  const noteBytes = calldataBytes("reject_amount", [t.term_id, pyStrip(note)]);

  return (
    <article className={`ticket ${pinned ? "t-pinned" : "t-open"}`}>
      <header className="t-band">
        <span className="t-kind">{pinned ? "Pinned · the text fixes the sum" : "Open term · the sum waits on both sides"}</span>
        <span className={`chip c-${t.state.toLowerCase()}`}>{t.state}</span>
      </header>
      <div className="t-body">
        <blockquote>{t.text}</blockquote>
        <div className={`gauge ${t.binding ? "g-binding" : "g-not"}`}>
          <Seals held={t.signatures_held} required={t.signatures_required} />
          <p className="gauge-line">{signatureLine(t)}</p>
        </div>
        {t.state === "PROPOSED" && <p className="unbound">This sum does not bind anyone yet</p>}
        <div className="sum-row">
          <div><span>Amount on record</span><strong>{t.amount === "0" ? "—" : groupDigits(t.amount)}</strong></div>
          <div><span>proposed_by</span><code>{t.proposed_by || "—"}</code></div>
          <div><span>countersigned_by</span><code>{t.countersigned_by || (pinned ? "— (never needed on a pinned term)" : "—")}</code></div>
        </div>
        <dl className="t-facts">
          <div><dt>Reading</dt><dd><code>{t.outcome}</code></dd></div>
          <div><dt>Certainty</dt><dd><code>{t.certainty}</code></dd></div>
          <div><dt>Author</dt><dd><code>{short(t.author)}</code></dd></div>
          <div><dt>Other side</dt><dd><code>{short(t.other_wallet)}</code> ({t.other_label})</dd></div>
        </dl>
        <p className="t-id">term id <code>{t.term_id}</code></p>
        {role && <p className={`you you-${role.replace(" ", "-")}`}>Connected wallet: <strong>{role}</strong></p>}
      </div>

      <div className="perf" aria-hidden="true" />

      {!pinned && (
        <div className="ledger">
          <div className="ledger-head"><strong>Negotiation ledger</strong><span>{roundLine(t)}</span></div>
          {rounds.length === 0 ? <p className="muted small">No round yet. Either side may propose the first sum.</p> : (
            <table>
              <thead><tr><th>round</th><th>amount</th><th>round_by</th><th>rejection</th></tr></thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.round}>
                    <td>{r.round}</td>
                    <td>{groupDigits(r.amount)}</td>
                    <td><code>{r.proposed_by}</code></td>
                    <td>{r.reject_note ? `“${r.reject_note}”` : r.round === t.round_count && t.state === "FINAL" ? "counter-signed" : r.round === t.round_count ? "on the table" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="t-act">
        <div className="row">
          <input value={amount} inputMode="numeric" placeholder="Amount (whole number)" onChange={(e) => setAmount(e.target.value)} />
          <button className="accept" disabled={busy || recordReason !== null || recordBytes > CALLDATA_LIMIT}
            onClick={async () => { if (parsed.ok) { await onRecord(t, parsed.value); setAmount(""); } }}>Record amount</button>
        </div>
        <div className="reasons">
          <small><Meter bytes={recordBytes} /></small>
          {recordReason && <span className="why">Record amount: {recordReason}</span>}
        </div>
        <div className="row">
          <button className="ghost" disabled={busy || signReason !== null} onClick={() => onCountersign(t)}>Counter-sign</button>
          {signReason && <span className="why">Counter-sign: {signReason}</span>}
        </div>
        <div className="row">
          <input value={note} maxLength={MAX_NOTE_LENGTH * 2} placeholder="Why you reject this sum" onChange={(e) => setNote(e.target.value)} />
          <button className="ghost" disabled={busy || rejectReason !== null || noteBytes > CALLDATA_LIMIT}
            onClick={async () => { await onReject(t, note); setNote(""); }}>Reject</button>
        </div>
        <div className="reasons">
          <small>{pyLen(pyStrip(note))}/{MAX_NOTE_LENGTH} · <Meter bytes={noteBytes} /></small>
          {rejectReason && <span className="why">Reject: {rejectReason}</span>}
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [me, setMe] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [tx, setTx] = useState<TxStatus>({ phase: "idle", message: "" });
  const [pendingHash, setPendingHash] = useState("");
  const pendingJob = useRef<{ what: string; verified: () => Promise<boolean>; after?: () => Promise<void> } | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);

  const [other, setOther] = useState("");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [exists, setExists] = useState(false);

  const [idInput, setIdInput] = useState("");
  const [current, setCurrent] = useState<Loaded | null>(null);

  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [pair, setPair] = useState<[Loaded | null, Loaded | null]>([null, null]);

  const busy = ["checking", "signing", "submitted"].includes(tx.phase) || pendingHash !== "";

  useEffect(() => {
    connectedWallet().then(setMe).catch(() => undefined);
    window.ethereum?.on?.("accountsChanged", (a: string[]) => setMe((a?.[0] ?? "").toLowerCase()));
  }, []);

  const remember = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)];
      saveRecent(next);
      return next;
    });
  }, []);

  const localId = me && pyStrip(text) ? termId(me, text) : "";

  useEffect(() => {
    let cancelled = false;
    setExists(false);
    if (!localId || !CONTRACT_ADDRESS) return;
    const t = setTimeout(() => {
      getTerm(localId).then((x) => !cancelled && setExists(!!x)).catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [localId]);

  const openReason = me ? openBlock({ me, otherWallet: other, label, text, exists }) : "Connect a wallet first";
  const openBytes = calldataBytes("open_term", [pyStrip(other) || "0x" + "0".repeat(40), pyStrip(label), pyStrip(text)]);

  async function connect() {
    try {
      const w = await requestWallet();
      await ensureStudioNet();
      setMe(w);
    } catch (e) {
      setTx({ phase: "error", message: errorMessage(e) });
    }
  }

  /** Reload every card that shows this id; return the fresh copy. */
  async function refresh(id: string): Promise<Loaded | null> {
    const next = await load(id);
    setCurrent((c) => (c && c.term.term_id === id ? next : c));
    setPair(([a, b]) => [a && a.term.term_id === id ? next : a, b && b.term.term_id === id ? next : b]);
    return next;
  }

  async function loadById(raw: string) {
    const id = cleanId(raw);
    if (!validId(id)) {
      setTx({ phase: "error", message: "Enter a 64-character term id." });
      return;
    }
    setTx({ phase: "idle", message: "" });
    setIdInput(id);
    const next = await load(id);
    setCurrent(next);
    setTab("inspect");
    if (!next) setTx({ phase: "error", message: "No term with this id on this deployment." });
    else remember(id);
  }

  async function loadPair() {
    const a = cleanId(leftId);
    const b = cleanId(rightId);
    setPair([validId(a) ? await load(a) : null, validId(b) ? await load(b) : null]);
  }

  /** Receipt first, then the postcondition on reloaded accepted state. */
  async function runWrite(what: string, send: () => Promise<string>, verified: () => Promise<boolean>, after?: () => Promise<void>) {
    pendingJob.current = { what, verified, after };
    let hash = "";
    try {
      setTx({ phase: "signing", message: `${what}: confirm in your wallet…` });
      hash = await send();
      setPendingHash(hash);
      setTx({ phase: "submitted", message: `${what}: submitted, waiting for the leader receipt…`, hash });
      await finish(what, hash, verified);
    } catch (e) {
      setTx({ phase: "error", message: errorMessage(e), hash: hash || undefined });
      setPendingHash("");
    }
  }

  async function finish(what: string, hash: string, verified: () => Promise<boolean>) {
    const verdict = await waitForVerdict(hash);
    if (verdict.kind === "pending") {
      setTx({ phase: "delayed", message: "Submitted — confirmation delayed. Do not resend; check again in a moment.", hash });
      return;
    }
    if (verdict.kind === "error") {
      setPendingHash("");
      setTx({ phase: "error", message: `${what} reverted: ${verdict.reason}`, hash });
      return;
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (await verified()) {
        setPendingHash("");
        setTx({ phase: "success", message: `${what}: executed, and the accepted state shows the change.`, hash });
        return;
      }
      await sleep(3000);
    }
    setTx({ phase: "delayed", message: `${what}: the receipt reports success but the accepted state does not show the change yet. Do not resend; check again in a moment.`, hash });
  }

  async function checkAgain() {
    if (!pendingHash) return;
    const job = pendingJob.current;
    setTx({ phase: "submitted", message: "Checking the receipt and the accepted state again…", hash: pendingHash });
    await finish(job?.what ?? "Pending transaction", pendingHash, job?.verified ?? (async () => true));
    if (job?.after) await job.after();
  }

  async function onOpen() {
    if (!me || !localId) return;
    setTx({ phase: "checking", message: "Checking the accepted state before sending…" });
    const already = !!(await getTerm(localId));
    const reason = openBlock({ me, otherWallet: other, label, text, exists: already });
    if (reason) {
      setExists(already);
      setTx({ phase: "error", message: reason });
      return;
    }
    if (openBytes > CALLDATA_LIMIT) {
      setTx({ phase: "error", message: `Calldata is ${openBytes} bytes; the RPC rejects more than ${CALLDATA_LIMIT}. Shorten the text.` });
      return;
    }
    const sub = { me, otherWallet: pyStrip(other).toLowerCase(), label, text, termId: localId };
    await runWrite(
      "Open term",
      () => sendWrite(me, "open_term", [sub.otherWallet, pyStrip(label), pyStrip(text)]),
      async () => openVerified(await getTerm(sub.termId), sub),
      async () => { setCurrent(await load(sub.termId)); },
    );
    remember(sub.termId);
    setIdInput(sub.termId);
    setText("");
    setTab("inspect");
    setCurrent(await load(sub.termId));
  }

  async function onRecord(t: Term, value: bigint) {
    const id = t.term_id;
    await runWrite("Record amount", () => sendWrite(me, "record_amount", [id, value]),
      async () => recordVerified(t, (await refresh(id))?.term ?? null, me, value), async () => { await refresh(id); });
    await refresh(id);
  }

  async function onCountersign(t: Term) {
    const id = t.term_id;
    await runWrite("Counter-sign", () => sendWrite(me, "countersign", [id]),
      async () => countersignVerified(t, (await refresh(id))?.term ?? null, me), async () => { await refresh(id); });
    await refresh(id);
  }

  async function onReject(t: Term, note: string) {
    const id = t.term_id;
    const n = pyStrip(note);
    await runWrite("Reject amount", () => sendWrite(me, "reject_amount", [id, n]),
      async () => { const x = await refresh(id); return rejectVerified(t, x?.term ?? null, x?.rounds ?? [], n); },
      async () => { await refresh(id); });
    await refresh(id);
  }

  const WORKSPACE: [Tab, string, string][] = [
    ["overview", "⌂", "Overview"],
    ["open", "+", "Open a term"],
    ["inspect", "◇", "Inspect term"],
    ["compare", "⇆", "Side by side"],
  ];
  const explorer = CONTRACT_ADDRESS ? `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}` : EXPLORER_BASE;
  const TITLES: Record<Tab, string> = {
    overview: "How many signatures bind",
    open: "Open a term",
    inspect: "Inspect a term",
    compare: "Two terms, one sum",
  };
  const ct = current?.term ?? null;
  const myRole = ct && me ? roleOf(ct, me) : null;
  const cardProps = { me, busy, onRecord, onCountersign, onReject };

  return (
    <div className="layout">
      <aside className="side">
        <div className="brand">
          <img src="/logo-192.png" alt="" width={42} height={42} />
          <div>
            <strong>Pinned</strong>
            <span>Intelligent Contract dApp</span>
          </div>
        </div>
        <p className="side-head">Workspace</p>
        <nav>
          {WORKSPACE.map(([t, icon, name]) => (
            <button key={t} className={tab === t ? "side-tab on" : "side-tab"} onClick={() => setTab(t)}>
              <i>{icon}</i>{name}
            </button>
          ))}
        </nav>
        <p className="side-head">Verification</p>
        <nav>
          <a className="side-tab" href={explorer} target="_blank" rel="noreferrer"><i>↗</i>Transaction truth</a>
          <button className="side-tab" onClick={() => { setTab("overview"); setTimeout(() => document.getElementById("reviewer-path")?.scrollIntoView({ behavior: "smooth" }), 50); }}><i>✓</i>Reviewer path</button>
        </nav>
        <div className="side-foot">
          <div className="netbox"><b /><div><strong>StudioNet</strong><span>Project deployment · 61999</span></div></div>
          <a href={explorer} target="_blank" rel="noreferrer">Open in Explorer ↗</a>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">GenLayer StudioNet</p>
            <h2>{TITLES[tab]}</h2>
          </div>
          <div className="top-actions">
            <a className="btn-outline" href={explorer} target="_blank" rel="noreferrer">Explorer ↗</a>
            {me ? <span className="btn-outline wallet"><b />{short(me)}</span> : <button className="btn-outline wallet" onClick={connect}><b />Connect wallet</button>}
          </div>
        </header>

        <main className="main">
          {tab === "overview" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <p className="eyebrow">Builder project · Intelligent contracts</p>
                  <h1>Pinned,<br /><em>or still open.</em></h1>
                  <p className="lead">
                    Pinned asks validators whether a stranger holding a text and the relevant records could arrive at the sum
                    alone. If yes, the author records it once and it binds at once. If not, it is only a proposal until the
                    other side counter-signs. The contract holds no money and moves nothing.
                  </p>
                  <div className="row">
                    <button className="btn-accent" onClick={() => setTab("open")}>Open a term</button>
                    <button className="btn-outline" onClick={() => setTab("inspect")}>Inspect term</button>
                  </div>
                </div>
                <div className="diagram">
                  <div className="diagram-top"><span className="pill-ok">✓ Accepted state</span><span className="eyebrow">Signature threshold</span></div>
                  <div className="nodes">
                    <div className="node"><b>¶</b><span>text</span></div>
                    <div className="edge"><span>read once</span></div>
                    <div className="node core"><b>✎</b><span>THRESHOLD</span></div>
                    <div className="fork">
                      <div className="branch"><div className="edge"><span>fixed</span></div><div className="node solid-node"><b>1</b><span>of 1</span></div></div>
                      <div className="branch"><div className="edge dashed"><span>to be agreed</span></div><div className="node ghost-node"><b>2</b><span>of 2</span></div></div>
                    </div>
                  </div>
                  <div className="diagram-foot">
                    <span>Semantic verdict</span>
                    <strong>FIXED → PINNED, 1 signature &nbsp;/&nbsp; TO_BE_AGREED → OPEN_TERM, 2 signatures</strong>
                  </div>
                </div>
              </section>

              <section className="stats">
                <div className="stat wide"><p className="eyebrow">Live contract</p><strong>{CONTRACT_ADDRESS ? short(CONTRACT_ADDRESS, 8, 6) : "—"}</strong><span>Bound to the Project StudioNet deployment.</span></div>
                <div className="stat"><p className="eyebrow">Current term</p><strong>{ct ? ct.state : "—"}</strong><span>{ct ? short(ct.term_id, 8, 6) : "Inspect a term"}</span></div>
                <div className="stat"><p className="eyebrow">Signatures</p><strong>{ct ? `${ct.signatures_held} of ${ct.signatures_required}` : "—"}</strong><span>{ct ? (ct.binding ? "binding" : "not binding yet") : "Read from the contract"}</span></div>
                <div className="stat"><p className="eyebrow">Wallet role</p><strong className="role-text">{myRole ?? "—"}</strong><span>{me ? short(me) : "Connect wallet"}</span></div>
              </section>

              <section className="path" id="reviewer-path">
                <p className="eyebrow">Reviewer path · two wallets of your own</p>
                <ol>
                  <li><b>1</b><div><strong>Open two terms</strong><span>With your first wallet, name your second wallet as the other side and open one text that pins the sum and one that leaves it to be agreed (the two sentences are in the README).</span></div></li>
                  <li><b>2</b><div><strong>Record the same sum on both</strong><span>Side by side: the first reads “Signatures: 1 of 1 — binding”, the second “Signatures: 1 of 2 — not binding yet”.</span></div></li>
                  <li><b>3</b><div><strong>Reject, then propose back</strong><span>With your second wallet, reject the open term and propose another sum. Counter-sign and Reject stay disabled on the pinned term.</span></div></li>
                  <li><b>4</b><div><strong>Counter-sign</strong><span>With your first wallet, counter-sign: 2 of 2, binding. One wallet alone can never take an open term to FINAL.</span></div></li>
                </ol>
              </section>
            </>
          )}

          {tab === "inspect" && (
            <>
              <section className="panel finder">
                <label>Term ID
                  <div className="row">
                    <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="64-character term id" spellCheck={false} />
                    <button className="btn-accent" onClick={() => loadById(idInput)}>Load</button>
                  </div>
                </label>
                <small className="muted">No wallet is required to inspect accepted state.</small>
                {recent.length > 0 && (
                  <div className="recent">
                    {recent.map((r) => <button key={r} className="link" onClick={() => loadById(r)}>{short(r, 8, 6)}</button>)}
                  </div>
                )}
              </section>
              {current ? <TermCard data={current} {...cardProps} /> : (
                <div className="empty">
                  <p>No term loaded. Paste a term id, or open one.</p>
                  <button className="link" onClick={() => setTab("open")}>Open a term →</button>
                </div>
              )}
            </>
          )}

          {tab === "open" && (
            <section className="panel">
              <p className="eyebrow">Author</p>
              <h3>Open a term</h3>
              <p className="muted">
                Name the other side and write the text about the sum. The validators read it once: if the text already fixes
                the sum, one signature (yours) will bind it; if it leaves the sum to be agreed, it will take two. Unclear
                wording takes two. The contract holds no money and moves nothing.
              </p>
              <div className="grid2">
                <label>Other side's wallet<input value={other} onChange={(e) => setOther(e.target.value)} placeholder="0x…" spellCheck={false} /></label>
                <label>Other side's label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="how the text names them" />
                  <small>{pyLen(pyStrip(label))}/{MAX_LABEL_LENGTH}</small></label>
              </div>
              <label>Text<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                <small>{pyLen(pyStrip(text))}/{MAX_TEXT_LENGTH} · <Meter bytes={openBytes} /></small></label>
              {localId && <p className="t-id">Term id if opened: <code>{localId}</code></p>}
              <div className="row">
                <button className="btn-accent" disabled={busy || openReason !== null || openBytes > CALLDATA_LIMIT} onClick={onOpen}>Open term</button>
                {openReason && <span className="why">{openReason}</span>}
                {!openReason && openBytes > CALLDATA_LIMIT && <span className="why">Calldata over {CALLDATA_LIMIT} bytes; shorten the text.</span>}
              </div>
              <p className="muted small">The text and label may not contain the tokens FIXED or TO_BE_AGREED; they are the answer tokens.</p>
            </section>
          )}

          {tab === "compare" && (
            <section className="panel">
              <p className="eyebrow">Same connected wallet</p>
              <h3>Side by side</h3>
              <p className="muted">Two terms, the same sum from the same wallet. One binds with one signature; the other waits for a second — and the only difference is the text.</p>
              <div className="grid2">
                <input value={leftId} onChange={(e) => setLeftId(e.target.value)} placeholder="first term id" spellCheck={false} />
                <input value={rightId} onChange={(e) => setRightId(e.target.value)} placeholder="second term id" spellCheck={false} />
              </div>
              <div className="row"><button className="btn-accent" onClick={loadPair}>Compare</button></div>
              <div className="pair">
                {pair.map((p, i) => (
                  <div key={i}>{p ? <TermCard data={p} {...cardProps} /> : <p className="empty">No term loaded.</p>}</div>
                ))}
              </div>
            </section>
          )}

          {tx.phase !== "idle" && (
            <section className={`status status-${tx.phase}`}>
              <strong>{tx.phase === "delayed" ? "Submitted — confirmation delayed" : tx.phase}</strong>
              <span>{tx.message}</span>
              {tx.hash && <a href={`${EXPLORER_BASE}/tx/${tx.hash}`} target="_blank" rel="noreferrer"><code>{tx.hash}</code></a>}
              {tx.phase === "delayed" && <button onClick={checkAgain}>Check again</button>}
            </section>
          )}

          <footer className="foot">GenLayer StudioNet · the contract holds no money and moves nothing; FINAL binds on this ledger only.</footer>
        </main>
      </div>
    </div>
  );
}
