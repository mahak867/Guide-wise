"use client";
import { useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui";
import { analysePreview, CHANNEL_ORDER, CHANNELS, countGraphemes, defaultChannel, tokens, truncateGraphemes, type Channel, type Item, type Preview } from "@/lib/preview";
import type { Kit, Rule } from "@/lib/types";

const WIDE = "(min-width: 640px)";
const subscribe = (cb: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

/** Text with hashtags and mentions (social) or *bold* (WhatsApp) shown as the app shows them. */
function Rich({ text, channel }: { text: string; channel: Channel }) {
  return <>{tokens(text, channel).map((t, i) => {
    if (t.t === "tag" || t.t === "mention") return <span key={i} className="text-minor">{t.v}</span>;
    if (t.t === "bold") return <b key={i} className="font-semibold">{t.v}</b>;
    if (t.t === "italic") return <i key={i}>{t.v}</i>;
    if (t.t === "strike") return <s key={i}>{t.v}</s>;
    return <span key={i}>{t.v}</span>;
  })}</>;
}

/** The dashed line where the app cuts the text, and the rest below it in grey (long text shortened here). */
function Cut({ p, label }: { p: Preview; label: string }) {
  if (!p.cut) return null;
  const rest = countGraphemes(p.hidden);
  const shown = rest > 400 ? truncateGraphemes(p.hidden, 400) : p.hidden;
  return (
    <>
      <div className="my-2 flex items-center gap-2 text-[11px] font-medium text-crit">
        <span aria-hidden className="h-0 flex-1 border-t border-dashed border-crit/70" />
        <span className="shrink-0">{label}</span>
        <span aria-hidden className="h-0 flex-1 border-t border-dashed border-crit/70" />
      </div>
      <p className="whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
        <Rich text={shown} channel={p.channel} />
        {shown !== p.hidden && <> … <i>({(rest - 400).toLocaleString("en-IN")} more characters)</i></>}
      </p>
    </>
  );
}

const STATUS: Record<Item["status"], { tone: string; label: (p: Preview) => string }> = {
  seen: { tone: "green", label: () => "Seen" },
  after: { tone: "major", label: (p) => p.spec.after.replace(/^./, (c) => c.toUpperCase()) },
  split: { tone: "major", label: () => "Cut in half" },
  missing: { tone: "critical", label: () => "Not in the draft" },
};

function Frame({ p, kit, image }: { p: Preview; kit?: Kit; image?: { dataUrl: string; alt: string } }) {
  const name = kit?.name ?? "Your brand";
  const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand";
  const avatar = <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">{name[0]?.toUpperCase()}</span>;
  const img = image && <img src={image.dataUrl} alt={image.alt || "First attached image"} className="aspect-square w-full border-y border-line object-cover" />;
  const text = <Rich text={p.visible} channel={p.channel} />;
  const tap = `Cut: hidden until the reader taps “${p.spec.more.replace(/^…\s?/, "")}”`;
  const box = "overflow-hidden rounded-lg border border-line bg-white text-[13px] leading-snug";
  const body = "whitespace-pre-wrap [overflow-wrap:anywhere]";

  if (p.channel === "instagram") return (
    <div className={box}>
      <div className="flex items-center gap-2 px-3 py-2">{avatar}<span className="font-semibold">{handle}</span></div>
      {img}
      <div className="px-3 py-2">
        <p className={body}><b className="font-semibold">{handle}</b> {text}{p.cut && <span className="text-muted">… more</span>}</p>
        <Cut p={p} label={tap} />
      </div>
    </div>
  );
  if (p.channel === "linkedin") return (
    <div className={box}>
      <div className="flex items-center gap-2 px-3 py-2">{avatar}<span><span className="block font-semibold">{name}</span><span className="block text-[11px] text-muted">Post</span></span></div>
      <div className="px-3 pb-3">
        <p className={body}>{text}{p.cut && <span className="text-muted">…see more</span>}</p>
        <Cut p={p} label={tap} />
      </div>
    </div>
  );
  if (p.channel === "facebook") return (
    <div className={box}>
      <div className="flex items-center gap-2 px-3 py-2">{avatar}<span><span className="block font-semibold">{name}</span><span className="block text-[11px] text-muted">Sponsored</span></span></div>
      <div className="px-3 pb-2">
        <p className={body}>{text}{p.cut && <span className="text-muted">… See more</span>}</p>
        <Cut p={p} label={tap} />
      </div>
      {img}
    </div>
  );
  if (p.channel === "whatsapp") return (
    <div className="rounded-lg border border-line bg-mist p-3 text-[13px] leading-snug">
      <div className={`ml-auto w-fit max-w-[92%] rounded-lg rounded-tr-none bg-brand-soft px-3 py-2 ${body}`}>{text || <span className="text-muted">(empty message)</span>}</div>
    </div>
  );
  if (p.channel === "email") return (
    <div className={box}>
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Inbox</div>
      <div className="px-3 py-2.5">
        <p className="font-semibold">{name}</p>
        <p className="truncate font-medium">{p.subject || <span className="text-muted">(no subject)</span>}</p>
        <p className="text-muted [overflow-wrap:anywhere]">{p.visible}{p.cut && "…"}</p>
        <Cut p={p} label="Rest of the email: seen once it is opened" />
      </div>
    </div>
  );
  return (
    <div className={box}>
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">First screen</div>
      <div className="px-3 py-2.5">
        <p className={`text-[14px] ${body}`}>{text}</p>
        <Cut p={p} label="Fold: the reader scrolls to see the rest" />
      </div>
    </div>
  );
}

/**
 * How the draft looks on a channel as you write: where the app cuts it, what a reader sees before tapping "more",
 * and a warning when the disclaimer, the call to action or the offer is after the cut. Cut-offs are approximate.
 */
export function ChannelPreview({ text, title, type, kit, rules, cta, image }: {
  text: string; title: string; type: string; kit?: Kit; rules: Rule[]; cta: string; image?: { dataUrl: string; alt: string };
}) {
  const id = useId();
  const [picked, setPicked] = useState<{ type: string; channel: Channel } | null>(null);
  const channel = picked?.type === type ? picked.channel : defaultChannel(type);
  // Open on a laptop, folded on a phone, until the writer opens or closes it.
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? wide;
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  const required = useMemo(() => rules.filter((r) => r.category === "disclaimer").map((r) => ({
    id: r.config.fixFactId ?? kit?.disclaimers[0]?.id ?? "",
    patterns: (r.config.patterns ?? []).map((e) => (typeof e === "string" ? e : { re: e.re })),
  })), [rules, kit]);
  const p = useMemo(() => analysePreview({ text, title, channel, disclaimers: kit?.disclaimers ?? [], required, cta }), [text, title, channel, kit, required, cta]);
  const spec = CHANNELS[channel];
  const empty = !text.trim();
  const warns = p.warnings.filter((w) => w.tone === "warn").length;

  function onKey(e: KeyboardEvent) {
    const i = CHANNEL_ORDER.indexOf(channel);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: CHANNEL_ORDER.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const c = CHANNEL_ORDER[(next + CHANNEL_ORDER.length) % CHANNEL_ORDER.length];
    setPicked({ type, channel: c });
    tabs.current[c]?.focus();
  }

  const heading = channel === "whatsapp" ? "WhatsApp shows the whole message"
    : channel === "email" ? "What the inbox list shows before the email is opened"
    : channel === "screen" ? "What the first screen shows before the reader scrolls"
    : `What a reader sees before ${spec.action}`;

  return (
    <details open={open} onToggle={(e) => setUserOpen(e.currentTarget.open)} className="rounded-md border border-line">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        <span className="font-medium">Preview on {spec.label}</span>
        {!empty && <span className="ml-2 text-xs text-muted">
          {p.cut ? `${p.shown} of ${p.total} characters before the cut` : `all ${p.total} characters shown`}
          {warns > 0 && <b className="ml-1.5 font-medium text-crit">· {warns} warning{warns === 1 ? "" : "s"}</b>}
        </span>}
      </summary>
      <div className="border-t border-line px-3 pb-3 pt-2.5">
        <div role="tablist" aria-label="Channel to preview" className="flex flex-wrap gap-1.5" onKeyDown={onKey}>
          {CHANNEL_ORDER.map((c) => (
            <button key={c} ref={(el) => { tabs.current[c] = el; }} type="button" role="tab" id={`${id}-tab-${c}`} aria-selected={c === channel} aria-controls={`${id}-panel`} tabIndex={c === channel ? 0 : -1}
              className={`rounded-full border px-2.5 py-1 text-xs ${c === channel ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-mist"}`}
              onClick={() => setPicked({ type, channel: c })}>
              {CHANNELS[c].label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${channel}`} tabIndex={0} className="mt-3 rounded-sm">
          {empty && !image ? <p className="text-sm text-muted">Write or paste the draft above to see where {spec.label === "First screen" ? "a page's first screen ends" : `${spec.label} cuts it`}, and whether the disclaimer and the call to action come before the cut.</p> : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
              <div className="min-w-0"><Frame p={p} kit={kit} image={channel === "instagram" || channel === "facebook" ? image : undefined} /></div>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{heading}</p>
                <p className="mt-0.5 text-muted">
                  {p.cut
                    ? <>The first <b className="text-ink">{p.shown}</b> of {p.total} characters{channel === "email" ? " of the body, after the subject" : ""}; the rest is {spec.after}.</>
                    : <>All <b className="text-ink">{p.total}</b> characters{spec.chars ? `: it fits in about ${spec.chars}` : ""}.</>}
                  {channel === "email" && p.subject != null && <> Subject from the {p.subjectFrom}: {countGraphemes(p.subject)} characters{countGraphemes(p.subject) > 40 ? "; phones show about the first 35 to 40" : ""}.</>}
                </p>
                {p.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1.5" aria-label="Warnings">
                    {p.warnings.map((w) => (
                      <li key={w.text} className={`rounded-md border px-2.5 py-1.5 ${w.tone === "warn" ? "border-crit/30 bg-crit-soft text-crit" : "border-line bg-mist text-ink"}`}>
                        <b className="font-medium">{w.tone === "warn" ? "Warning: " : "Note: "}</b>{w.text}
                      </li>
                    ))}
                  </ul>
                )}
                {p.items.length > 0 && (
                  <ul className="mt-2.5 space-y-1" aria-label="Where each part falls">
                    {p.items.map((it) => (
                      <li key={it.kind + it.label} className="flex flex-wrap items-baseline gap-x-1.5">
                        <Badge tone={STATUS[it.status].tone}>{STATUS[it.status].label(p)}</Badge>
                        <span>{it.label}{it.at ? <span className="text-muted"> (character {it.at})</span> : null}:</span>
                        <q className="text-muted [overflow-wrap:anywhere]">{it.quote}</q>
                      </li>
                    ))}
                  </ul>
                )}
                <Approx>{channel === "whatsapp" ? "Shown in full; *bold*, _italic_ and ~strike~ are rendered as WhatsApp does." : null}</Approx>
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function Approx({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-2.5 text-xs text-muted">
      {children} Cut-off lengths are approximate: each app also cuts by line count and screen width, and it varies by device, font size and app version.
      Characters are counted as a reader sees them (an emoji is one), and the cut never splits one.
    </p>
  );
}
