import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCopy } from 'react-icons/fi';
import { IoSparkles } from 'react-icons/io5';
import NewPdSheet from '../../components/sarthi/NewPdSheet';
import PastPhotos from '../../components/sarthi/PastPhotos';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatINR } from '../../utils/formatters';
import { getCase } from '../../services/sarthi/knowledge';
import { identitySummary } from '../../services/sarthi/idChecks';
import { mapLink, inDistance } from '../../services/sarthi/geo';
import { MODES, OUTCOMES, REVIEW_DECISIONS, pdOutcome, aiOutcome, makeReview, removeDraft } from '../../services/sarthi/repeat';
import { loadFace, callFrameKey } from '../../services/sarthi/face';
import { useSarthiReports, usePendingPds } from '../../hooks/useSarthiReports';
import ConfirmPd from '../../components/sarthi/ConfirmPd';
import { readRetention, expiry, VIDEO_PREFIX } from '../../services/retention';
import styles from './SarthiReport.module.css';

// Colour classes per outcome (the stamp keeps its green / amber / red styles).
const STAMP = { satisfactory: 'green', human: 'amber', red: 'red' };

const MARK = { confirmed: 'holds up', contradicted: 'contradicted', unverified: 'unsettled' };
const GST_WORD = { match: 'matches the file', mismatch: 'NOT the GSTIN on file', not_on_file: 'nothing on file to match' };
const CHECKER_ROLES = ['Credit Manager', 'Branch Manager', 'Credit Officer', 'Risk / Fraud Control'];
const readJson = (key) => { try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; } };
const clock = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export default function SarthiReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reports, setReports] = useSarthiReports();
  const [pending, setPending] = usePendingPds();
  const caseData = getCase(id);
  const [params] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  // Every PD is kept; ?pd= opens one, otherwise one awaiting confirmation, else the latest.
  const all = reports.filter((x) => x.caseId === id);
  const waiting = pending.filter((x) => x.caseId === id);
  const r = [...waiting, ...all].find((x) => x.id === params.get('pd')) ?? waiting[0] ?? all[0];
  const unsaved = waiting.includes(r);

  const blocks = useMemo(() => parseMarkdown(r?.report ?? ''), [r?.report]);
  // Images live outside the report record so their weight can never break its write.
  const photos = useMemo(() => {
    const read = (key) => { try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; } };
    return read(`bo_sarthi_photos_${r?.id}`) ?? read(`bo_sarthi_photos_${id}`) ?? []; // per PD; per case before repeat PDs
  }, [id, r?.id]);
  const callFrame = useMemo(() => readJson(callFrameKey(r?.id)), [r?.id]);
  const liveFrames = useMemo(() => readJson(`bo_sarthi_live_${r?.id}`), [r?.id]);
  // System events only (GPS, photos, liveness): the transcript stays out of the report so a BO who reads hundreds
  // of them never learns the questions (docs/sarthi.md, "Findings, not questions").
  const log = useMemo(() => (r?.callLog ?? []).map((e) => ({ at: e.at, who: 'System', text: e.text, tone: e.tone })), [r?.callLog]);

  if (!r) {
    return (
      <Page mode="slide" className="sarthi">
        <TopBar back title="No report yet" hideBell />
        <EmptyState
          emoji="🗂️"
          title="This file has not been interviewed"
          subtitle="The report is written the moment the interview ends."
          actionLabel="Open the brief"
          onAction={() => navigate(`/sarthi/brief/${id}`)}
        />
      </Page>
    );
  }

  const confirm = (confirmedBy) => {
    setReports((prev) => [{ ...r, confirmedBy }, ...prev]);
    setPending((prev) => prev.filter((x) => x.id !== r.id));
    removeDraft(r.id); // a dropped call's draft, now on file
    toast('PD saved', 'success');
  };
  const verdict = pdOutcome(r);
  const key = STAMP[verdict.key];
  const counts = r.evidence.reduce((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {});

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.report);
      toast('Report copied', 'success');
    } catch {
      toast('This browser would not let me copy it');
    }
  };

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={r.name} subtitle={`${all.length > 1 ? `PD ${r.pdNo ?? 1} of ${all.length} · ${MODES[r.mode]?.label ?? 'Full PD'} · ` : ''}Interviewed ${formatDate(r.createdAt)}`} hideBell />
      {r.complete === false && (
        <p className={styles.incomplete}>
          {r.dropped ? 'Call dropped before the PD ended — saved at the last answer' : 'Ended early'}, {r.coverage ?? 0}% of the topics covered. Start &quot;Finish last PD&quot; from the customer page to ask only what is left.
        </p>
      )}

      {/* the one loud moment: the verdict lands like a stamp */}
      <motion.div
        className={`${styles.stamp} ${styles[key]}`}
        initial={{ scale: 1.5, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
      >
        <span className={`${styles.stampWord} ${verdict.label.length > 12 ? styles.stampLong : ''}`}>{verdict.label}</span>
        <span className={styles.stampSub}>Sarthi AI — advisory</span>
      </motion.div>
      <p className={styles.verdictLine}>{verdict.line}</p>
      {unsaved ? (
        <p className={styles.incomplete}>Not saved yet — review the report, then confirm it at the end. Until a BO or CO confirms, this PD is not on the file.</p>
      ) : (
        <>
          <p className={styles.checkerLine}>
            {r.confirmedBy && `Reviewed by ${r.confirmedBy.name} (${r.confirmedBy.role}) · `}
            {r.review
              ? `Checked by ${r.review.by} (${r.review.role}) — Sarthi said ${aiOutcome(r).label}`
              : 'Sarthi\'s proposal — awaiting a checker (see the end of the report)'}
          </p>
          {/* a new PD that follows up THIS one — its flags, or the topics it did not reach */}
          <button className={styles.newPd} onClick={() => setSheet(true)}><IoSparkles size={16} /> Sarthi AI — new PD after this one</button>
          <NewPdSheet open={sheet} onClose={() => setSheet(false)} caseId={id} pd={r} />
        </>
      )}
      <Retention r={r} />

      <div className={styles.tally}>
        {counts.confirmed > 0 && <span className={styles.tallyClear}>{counts.confirmed} held up</span>}
        {counts.contradicted > 0 && <span className={styles.tallyStamp}>{counts.contradicted} contradicted</span>}
        {counts.unverified > 0 && <span className={styles.tallyWatch}>{counts.unverified} unsettled</span>}
        <span className={styles.tallyTurns}>{r.turns} exchanges</span>
      </div>

      {/* the same person, an earlier PD: answers that changed */}
      {r.flags?.some((f) => f.type === 'repeat_pd') && (
        <>
          <h2 className={styles.head}>Changed since the earlier PD</h2>
          <ul className={styles.idChecks}>
            {r.flags.filter((f) => f.type === 'repeat_pd').map((f) => <li key={f.detail} className={styles.fail}>✕ {f.detail}</li>)}
          </ul>
        </>
      )}

      {/* the ledger */}
      <h2 className={styles.head}>What they said, against what we hold</h2>
      {r.evidence.length === 0 ? (
        <p className={styles.empty}>No checkable figures came up in this interview.</p>
      ) : (
        <div className={styles.ledger}>
          {r.evidence.map((e) => (
            <article key={e.id} className={`${styles.entry} ${styles[`e_${e.status}`]}`}>
              <div className={styles.entryTop}>
                <h3 className={styles.claimName}>{e.claim}</h3>
                <span className={`${styles.mark} ${styles[`m_${e.status}`]}`}>{MARK[e.status] ?? e.status}</span>
              </div>
              <div className={styles.against}>
                <div>
                  <div className={styles.againstLabel}>said</div>
                  <div className={styles.againstSaid}>{e.declared}</div>
                </div>
                <div>
                  <div className={styles.againstLabel}>held</div>
                  <div className={styles.againstHeld}>{e.verified}</div>
                </div>
              </div>
              <p className={styles.detail}>{e.detail} <span className={styles.src}>({e.source})</span></p>
            </article>
          ))}
        </div>
      )}

      {/* insider knowledge — the score only, never the questions */}
      {r.understanding && (
        <>
          <h2 className={styles.head}>How well they know their business</h2>
          <div className={r.understanding.redFlag + r.understanding.vague >= 2 ? styles.idBad : styles.idOk}>
            <p className={styles.idLine}>
              <strong>{r.understanding.clear} of {r.understanding.total}</strong> insider answers clear
              {r.understanding.vague ? ` · ${r.understanding.vague} vague` : ''}
              {r.understanding.redFlag ? ` · ${r.understanding.redFlag} red flag` : ''}
            </p>
          </div>
        </>
      )}

      {/* the trade's arithmetic, computed in code */}
      {r.tradeMath && (
        <>
          <h2 className={styles.head}>Does the hisaab add up</h2>
          <ul className={styles.idChecks}>
            {r.tradeMath.map((m) => (
              <li key={m.check} className={m.pass ? styles.pass : styles.fail}>{m.pass ? '✓' : '✕'} {m.detail}</li>
            ))}
          </ul>
        </>
      )}

      {/* identity — what was checked, and plainly what was not */}
      {r.identity && (
        <>
          <h2 className={styles.head}>Identity</h2>
          <div className={r.identity.ok ? styles.idOk : styles.idBad}>
            <p className={styles.idLine}>{identitySummary(r.identity)}</p>
            <ul className={styles.idChecks}>
              {r.identity.checks.map((c) => (
                <li key={c.label} className={c.pass ? styles.pass : styles.fail}>
                  {c.pass ? '✓' : '✕'} {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* the customer photo on file against a still from the call — on-device face recognition, shown so the officer can look */}
      {r.face && (
        <>
          <h2 className={styles.head}>Face check</h2>
          <div className={r.face.verdict === 'different' ? styles.idBad : styles.idOk}>
            <div className={styles.faces}>
              <figure><img src={loadFace(id)?.dataUrl} alt="Customer photo on file" /><figcaption>Photo on file</figcaption></figure>
              <figure>
                {callFrame ? <img src={callFrame} alt="Frame from the call" /> : <div className={styles.noShot}>No frame</div>}
                <figcaption>On the call</figcaption>
              </figure>
            </div>
            <p className={styles.idLine}>
              {r.face.verdict === 'same' && 'Looks like the same person.'}
              {r.face.verdict === 'different' && 'Does not look like the same person — confirm in person who took the call.'}
              {r.face.verdict === 'unsure' && 'Could not tell — look at both pictures yourself.'}
              {!r.face.verdict && 'Not compared — the camera was off or the AI could not be reached.'}
              {r.face.reason ? ` ${r.face.reason}` : ''}
            </p>
          </div>
        </>
      )}

      {/* one random action on camera, the frame before and after it — a replayed or recorded video cannot follow it */}
      {r.liveness && (
        <>
          <h2 className={styles.head}>Liveness</h2>
          <div className={r.liveness.verdict === 'no' ? styles.idBad : styles.idOk}>
            {liveFrames && (
              <div className={styles.faces}>
                <figure><img src={liveFrames[0]} alt="Frame before asking" /><figcaption>Before</figcaption></figure>
                <figure><img src={liveFrames[1]} alt="Frame after asking" /><figcaption>After asking</figcaption></figure>
              </div>
            )}
            <p className={styles.idLine}>
              A random action on camera.{' '}
              {r.liveness.verdict === 'yes' && 'They did it — the video was live.'}
              {r.liveness.verdict === 'no' && 'The frame after does not show it — the video may be recorded, replayed or not live.'}
              {r.liveness.verdict === 'unsure' && 'Could not tell — look at both frames yourself.'}
              {!r.liveness.verdict && 'Not compared — no frame, or the AI could not be reached.'}
              {r.liveness.reason ? ` ${r.liveness.reason}` : ''}
            </p>
          </div>
        </>
      )}

      {/* where the phone was when the call started and ended, against the pins on file */}
      {r.callGeo && (
        <>
          <h2 className={styles.head}>Where the call was taken</h2>
          <ul className={styles.idChecks}>
            <li><GeoPoint label="Start" fix={r.callGeo.start} /></li>
            <li><GeoPoint label="End" fix={r.callGeo.end} /></li>
            <li className={r.callGeo.place?.away ? styles.fail : r.callGeo.place?.status === 'near' ? styles.pass : ''}>{placeWords(r.callGeo.place)}</li>
          </ul>
        </>
      )}

      {/* names read off their photos (board, QR, bill book, shop papers, bills) against their own file */}
      {r.nameChecks?.length > 0 && (
        <>
          <h2 className={styles.head}>Names on the photos vs the file</h2>
          <ul className={styles.idChecks}>
            {r.nameChecks.map((ch) => {
              const bad = ch.verdict === 'none' || ch.gstin === 'mismatch';
              return (
                <li key={`${ch.kind}${ch.at}`} className={bad ? styles.fail : styles.pass}>
                  {bad ? '✕' : '✓'} {ch.label}: {ch.read.length ? `"${ch.read.join('", "')}"` : 'no name'}
                  {ch.verdict === 'match' && ' — matches the file'}
                  {ch.verdict === 'none' && " — not the applicant's or the business name on file"}
                  {ch.gstins.length > 0 && ` · GSTIN ${ch.gstins.join(', ')} (${GST_WORD[ch.gstin]})`}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* living conditions: the facts the home photos show, then Sarthi's few sentences on them — no scores */}
      {r.living && (
        <>
          <h2 className={styles.head}>Living conditions</h2>
          <div className={styles.living}>
            <ul className={styles.livingFacts}>
              {(r.living.facts ?? []).map((f) => <li key={f}>{f}</li>)}
            </ul>
            {r.living.analysis && <p className={styles.livingAnalysis}>{r.living.analysis}</p>}
          </div>
        </>
      )}

      {/* photographs the applicant took during the interview */}
      {photos.length > 0 && (
        <>
          <h2 className={styles.head}>What they photographed</h2>
          <div className={styles.shots}>
            {photos.map((p, i) => (
              <figure key={i} className={styles.shot}>
                <div className={styles.shotPics}>
                  {p.dataUrl
                    ? <img src={p.dataUrl} alt={`Submitted as ${p.label}`} />
                    : <div className={styles.noShot}>Not sent</div>}
                  {p.panDataUrl && <img src={p.panDataUrl} alt="The live turn to the shop door" />}
                </div>
                <figcaption>
                  <span className={styles.shotLabel}>Sent as {p.label}</span>
                  {p.skipped && <span className={styles.shotWarn}>Refused to photograph — worth asking why</span>}
                  {p.provenance?.source === 'live_camera' && <span className={styles.shotOk}>Taken with the live camera during the interview</span>}
                  {p.pan?.moved && p.pan.sameStream && <span className={styles.shotOk}>Turned the camera to the shop door live, {p.pan.seconds}s later (second picture)</span>}
                  <PlaceLine p={p} onFile={caseData?.locations?.[p.kind]} />
                  {p.links?.map((l) => (
                    <span key={l.otherCase} className={l.vision?.verdict === 'different' && !l.names.length ? styles.shotObs : styles.shotWarn}>
                      Same spot as {l.otherName}&apos;s {l.otherLabel}
                      {l.distance != null && ` (${inDistance(l.distance)} apart)`}
                      {l.names.length > 0 && ` · same name: ${l.names.join(', ')}`}
                      {l.vision && ` · AI comparing both: ${l.vision.verdict}`}
                      {' — '}<Link className={styles.shotLink} to={`/sarthi/report/${l.otherCase}${l.otherReport ? `?pd=${l.otherReport}` : ''}`}>open their report</Link>
                    </span>
                  ))}
                  {p.stock && (
                    <span className={p.stockCheck && p.stockCheck.status !== 'fits' ? styles.shotWarn : styles.shotObs}>
                      Stock in view (AI estimate): {p.stock.value_high ? `${formatINR(p.stock.value_low ?? 0)}–${formatINR(p.stock.value_high)}` : 'could not tell'}, {p.stock.fullness ?? 'unclear'} shelves
                      {p.stockCheck ? ` · they said ${formatINR(p.stockCheck.declared)}` : ''}
                    </span>
                  )}
                  {p.provenance?.flags?.map((f, j) => <span key={j} className={styles.shotWarn}>{f.detail}</span>)}
                  {p.observation && <span className={styles.shotObs}>{p.observation}</span>}
                  {!p.observation && !p.skipped && <span className={styles.shotWarn}>{p.note ?? 'Not machine-read. Look at it yourself.'}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {/* past satellite / street photos of the pins on file, against the claimed vintage */}
      <PastPhotos caseId={id} locations={caseData?.locations} claimedVintage={caseData?.businessVintage} />

      {/* the written report */}
      <h2 className={styles.head}>The full report</h2>
      <div className={styles.md}>{blocks}</div>

      {/* every exchange and system event with its time — the audit trail of this call */}
      {log.length > 0 && (
        <details className={styles.log}>
          <summary>Call log — {log.length} events, each with its time</summary>
          <ol>
            {log.map((e, i) => (
              <li key={i} className={e.who === 'System' ? `${styles.logSys} ${e.tone === 'warn' ? styles.logWarn : ''}` : ''}>
                <span className={styles.logTime}>{e.at ? clock(e.at) : '—'}</span>
                <span className={styles.logWho}>{e.who}</span>
                <span className={styles.logText}>{e.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* citation audit */}
      {!r.dropped && <section className={`${styles.audit} ${r.validation?.isClean ? styles.auditClean : styles.auditFlag}`}>
        <h2 className={styles.auditHead}>Every claim traced to its source</h2>
        {r.validation?.isClean ? (
          <p>
            All {r.validation.checked?.citations ?? 0} citations point at a real turn in the interview
            or a real field in the file. Eligibility came from the calculator, not the model.
          </p>
        ) : (
          <>
            <p>
              {r.validation?.removedCount ? `${r.validation.removedCount} finding(s) removed for citing something that does not exist. ` : ''}
              {r.validation?.issues?.length ?? 0} issue(s) caught before you saw this:
            </p>
            <ul>
              {(r.validation?.issues ?? []).map((i, n) => <li key={n}>{i.detail}</li>)}
            </ul>
          </>
        )}
        {r.eligibility?.formula && <p className={styles.formula}>{r.eligibility.formula}</p>}
      </section>}

      {unsaved
        ? <ConfirmPd onConfirm={confirm} />
        : <CheckerReview r={r} onSave={(review) => setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, review } : x)))} />}

      <div className={styles.actions}>
        <button className={styles.copy} onClick={copy}><FiCopy size={17} /> Copy the report</button>
        <button className={styles.back} onClick={() => navigate('/sarthi')}>Back to the queue</button>
      </div>

    </Page>
  );
}

/* ---------------------------------------------------------------- tiny markdown renderer */

const inline = (text, key) => String(text)
  .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  .filter(Boolean)
  .map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <b key={`${key}-${i}`}>{p.slice(2, -2)}</b>;
    if (p.startsWith('*') && p.endsWith('*')) return <i key={`${key}-${i}`}>{p.slice(1, -1)}</i>;
    return <span key={`${key}-${i}`}>{p}</span>;
  });

/** Handles only what Agent 2 is told to emit: headings, tables, bullets, rules, bold/italic. */
function parseMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let list = [];
  let table = null;

  const flushList = () => {
    if (list.length) {
      out.push(<ul key={`ul-${out.length}`} className={styles.ul}>{list.map((t, i) => <li key={i}>{inline(t, `li-${out.length}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  const flushTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push(
        <div key={`tb-${out.length}`} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell, `td-${i}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      table = null;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-{2,}$/.test(c.replace(/:/g, '')))) return; // separator row
      flushList();
      (table ??= []).push(cells);
      return;
    }
    flushTable();

    if (!line.trim()) { flushList(); return; }

    if (/^#{1,6}\s/.test(line)) {
      flushList();
      out.push(<h3 key={`h-${out.length}`} className={styles.mdH}>{line.replace(/^#+\s*/, '')}</h3>);
      return;
    }
    if (/^(-{3,}|_{3,})$/.test(line.trim())) { flushList(); out.push(<hr key={`hr-${out.length}`} className={styles.hr} />); return; }
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); return; }

    flushList();
    out.push(<p key={`p-${out.length}`} className={styles.p}>{inline(line, `p-${out.length}`)}</p>);
  });

  flushList();
  flushTable();
  return out;
}

// Where a shop / home photo was taken, against the file's pin; with no pin the officer gets the point to check.
function PlaceLine({ p, onFile }) {
  if (p.kind !== 'shop' && p.kind !== 'home') return null;
  const fix = p.location;
  if (!fix || fix.error) {
    return !p.skipped && fix ? <span className={styles.shotWarn}>Location not shared when this was taken — place not verified</span> : null;
  }
  const check = p.placeCheck ?? {};
  const pin = <a className={styles.shotLink} href={mapLink(fix)} target="_blank" rel="noreferrer">Taken at {fix.lat}, {fix.lng} (±{fix.accuracy} m)</a>;
  const filed = onFile && <> · <a className={styles.shotLink} href={mapLink(onFile)} target="_blank" rel="noreferrer">{p.kind} on file</a></>;
  if (check.status === 'far') return <span className={styles.shotWarn}>{inDistance(check.distance)} from the {p.kind} location on file — may not be their place. {pin}{filed}</span>;
  if (check.status === 'near') return <span className={styles.shotOk}>Within {inDistance(check.distance)} of the {p.kind} location on file. {pin}{filed}</span>;
  return <span className={styles.shotObs}>No {p.kind} location on file — open the pin and check it is their place. {pin}</span>;
}

function GeoPoint({ label, fix }) {
  if (fix?.lat == null) return <>{label}: location not shared{fix?.error ? ` (${fix.error})` : ''}</>;
  return <>{label}: <a className={styles.shotLink} href={mapLink(fix)} target="_blank" rel="noreferrer">{fix.lat}, {fix.lng}</a> (±{fix.accuracy} m)</>;
}

function placeWords(place) {
  if (!place || place.status === 'no_fix') return 'Location was not shared at the start — where the call was taken is not known.';
  if (place.status === 'not_on_file') return 'No shop or home pin on file — open the points above to check where they were.';
  if (place.away) return `✕ Said they were at their ${place.claimed}, but the call was ${inDistance(place.away.distance)} from the ${place.claimed} on file.`;
  if (place.at) return `✓ At their ${place.at} — within ${inDistance(place.nearest.distance)} of the pin on file.`;
  return `Not at the shop or home on file — the nearest pin (${place.nearest.kind}) is ${inDistance(place.nearest.distance)} away.`;
}

// The org's retention policy on this PD: until when the report can back a credit decision, and the call video's deletion date.
function Retention({ r }) {
  const policy = readRetention();
  const valid = expiry(r.createdAt, policy.pdValidityDays);
  const video = readJson(`${VIDEO_PREFIX}${r.id}`);
  const on = (d) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <ul className={styles.retention}>
      <li className={valid.expired ? styles.fail : valid.daysLeft <= 7 ? styles.warnLine : ''}>
        {valid.expired
          ? `PD expired on ${on(valid.until)} — start a new PD before any credit decision.`
          : `PD valid till ${on(valid.until)} (${valid.daysLeft} day${valid.daysLeft === 1 ? '' : 's'} left · ${policy.pdValidityDays}-day policy)`}
      </li>
      <li>
        {video
          ? `Call video kept till ${on(expiry(video.at, policy.videoRetentionDays).until)}, then deleted (${policy.videoRetentionDays}-day policy)`
          : `No video recorded on this call · recordings are kept ${policy.videoRetentionDays} days`}
      </li>
    </ul>
  );
}

// Maker-checker: Sarthi and the officer who ran the PD propose; a second person agrees, changes or sends it back.
function CheckerReview({ r, onSave }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', role: CHECKER_ROLES[0], decision: 'agree', outcome: '', note: '' });
  const ai = aiOutcome(r);
  if (r.review) {
    const rv = r.review;
    return (
      <>
        <h2 className={styles.head}>Checker review</h2>
        <div className={rv.decision === 'agree' ? styles.idOk : styles.idBad}>
          <p className={styles.idLine}>
            <strong>{REVIEW_DECISIONS[rv.decision]}</strong>
            {rv.outcome ? ` — ${OUTCOMES[rv.ai]?.label} → ${OUTCOMES[rv.outcome].label}` : ''}
          </p>
          <p className={styles.idLine}>&quot;{rv.note}&quot;</p>
          <p className={styles.shotFoot}>{rv.by} ({rv.role}), {new Date(rv.at).toLocaleString('en-IN')} · maker: {r.by?.name ?? 'the officer'}</p>
        </div>
      </>
    );
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = () => {
    const { error, review } = makeReview(r, form);
    if (error) { toast(error); return; }
    onSave(review);
    toast('Review saved to the audit trail', 'success');
  };
  return (
    <>
      <h2 className={styles.head}>Checker review</h2>
      <div className={styles.review}>
        <p className={styles.reviewNote}>
          Sarthi and {r.by?.name ?? 'the officer'} propose <strong>{ai.label}</strong>. A second person agrees, changes it or sends it
          back — the officer who ran the PD cannot check it.
        </p>
        <label className={styles.reviewField}>Checker name<input value={form.name} onChange={set('name')} placeholder="Full name" /></label>
        <label className={styles.reviewField}>
          Role
          <select value={form.role} onChange={set('role')}>{CHECKER_ROLES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <div className={styles.reviewChoices}>
          {Object.entries(REVIEW_DECISIONS).map(([k, label]) => (
            <button type="button" key={k} className={form.decision === k ? styles.choiceOn : styles.choice} onClick={() => setForm((f) => ({ ...f, decision: k }))}>{label}</button>
          ))}
        </div>
        {form.decision === 'change' && (
          <label className={styles.reviewField}>
            Change to
            <select value={form.outcome} onChange={set('outcome')}>
              <option value="">Pick an outcome</option>
              {Object.entries(OUTCOMES).filter(([k]) => k !== ai.key).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </label>
        )}
        <label className={styles.reviewField}>
          Reason
          <textarea rows={3} value={form.note} onChange={set('note')} placeholder="What you checked, and why" />
        </label>
        <button className={styles.copy} onClick={submit}>Save review</button>
      </div>
    </>
  );
}
