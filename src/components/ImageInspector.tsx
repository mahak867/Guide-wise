"use client";
// Shows where a creative's problems are: the image with outlines drawn over it (failing text lines with their measured
// contrast and size, off-palette colour areas with their hex, the logo with its size and clear space), a legend, and a
// list of the same regions in text. The list is the accessible version of the drawing: each entry is a button that
// highlights its region when focused, hovered or pressed.
import { useId, useState } from "react";
import { inspectorRegions, type InspectorImage, type InspectorRegion } from "@/lib/regions";
import type { Finding } from "@/lib/types";

export interface ImageInspectorProps {
  /** One image of a draft as stored (draft.images[i]) or as analysed in the browser (ImageInput): needs dataUrl, w and h. */
  image: InspectorImage & { name?: string; alt?: string; dataUrl?: string };
  /** The image's position in draft.images, from 0. Findings are matched on location `image:${index + 1}`. */
  index: number;
  /** The draft's findings (all of them is fine; only this image's are used). Pass the ones you want shown, e.g. open ones. */
  findings: Pick<Finding, "quote" | "region" | "message" | "location" | "rule_id">[];
  /** Thresholds used in the labels; they default to the seed rules' values (16px, 4.5:1, a quarter of the logo's height). */
  minPx?: number;
  minContrast?: number;
  clear?: number;
}

const STROKE: Record<InspectorRegion["kind"], string> = {
  text: "var(--color-crit)",
  colour: "var(--color-major)",
  logo: "var(--color-brand)",
};
const NAME: Record<InspectorRegion["kind"], string> = {
  text: "Text below the contrast or size minimum",
  colour: "Colour outside the brand palette",
  logo: "Logo, with its clear space dashed",
};

export function ImageInspector({ image, index, findings, minPx, minContrast, clear }: ImageInspectorProps) {
  // A region is highlighted while its list entry is focused or hovered; pressing the entry pins it.
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hover ?? pinned;
  const id = useId();
  const regions = inspectorRegions(image, index, findings, { minPx, minContrast, clear });
  if (!image.dataUrl || !image.w || !image.h) return null;
  const W = 1000, H = Math.round((1000 * image.h) / image.w);
  const font = Math.max(16, Math.round(W / 40));
  const label = image.name ? `${image.name}` : `Image ${index + 1}`;
  const counts = { text: 0, colour: 0, logo: 0 };
  for (const r of regions) counts[r.kind]++;
  const problems = regions.filter((r) => r.messages.length).length;
  const summary = regions.length
    ? `${label}: ${problems === 0 ? "no problems marked" : `${problems} area${problems === 1 ? "" : "s"} with a problem`}` +
      `${counts.text ? `, ${counts.text} text line${counts.text === 1 ? "" : "s"}` : ""}${counts.colour ? `, ${counts.colour} off-palette colour area${counts.colour === 1 ? "" : "s"}` : ""}` +
      `${counts.logo ? (image.logo?.found ? `; logo at ${Math.round((image.logo.box?.w ?? 0) * 100)}% of the width` : "") : ""}.`
    : `${label}: nothing to mark. Areas are shown for findings that have a place in the image, and for the logo when it is found.`;
  const kinds = (Object.keys(counts) as InspectorRegion["kind"][]).filter((k) => counts[k]);

  return (
    <figure className="m-0" aria-labelledby={`${id}-cap`}>
      <div className="relative w-full overflow-hidden rounded-md border border-line bg-mist" style={{ aspectRatio: `${image.w} / ${image.h}` }}>
        <img src={image.dataUrl} alt={image.alt || label} className="absolute inset-0 h-full w-full" />
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
          {regions.map((r) => {
            const on = active === null || active === r.key;
            const x = r.box.x * W, y = r.box.y * H, w = r.box.w * W, h = r.box.h * H;
            const pad = 4;
            const tw = r.label.length * font * 0.58 + 12;
            const ty = y - pad - font - 8 < 0 ? y + h + pad : y - pad - font - 8;
            return (
              <g key={r.key} opacity={on ? 1 : 0.25} style={{ transition: "opacity 140ms" }}>
                {r.clear && (
                  <rect x={r.clear.x * W} y={r.clear.y * H} width={r.clear.w * W} height={r.clear.h * H} fill="none" stroke={STROKE.logo} strokeWidth={2} strokeDasharray="8 6" />
                )}
                {/* A light halo under each outline keeps it visible on dark and light images alike. */}
                <rect x={x - pad} y={y - pad} width={w + 2 * pad} height={h + 2 * pad} fill="none" stroke="#FFFFFF" strokeWidth={active === r.key ? 9 : 6} rx={4} />
                <rect x={x - pad} y={y - pad} width={w + 2 * pad} height={h + 2 * pad} fill="none" stroke={STROKE[r.kind]} strokeWidth={active === r.key ? 5 : 3} rx={4} />
                <rect x={Math.min(x - pad, W - tw)} y={ty} width={tw} height={font + 8} fill={STROKE[r.kind]} rx={3} />
                <text x={Math.min(x - pad, W - tw) + 6} y={ty + font} fontSize={font} fill="#FFFFFF" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontWeight={600}>{r.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id={`${id}-cap`} className="mt-2 text-sm">{summary}</figcaption>
      {kinds.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-[2px] border-2" style={{ borderColor: STROKE[k], borderStyle: k === "logo" ? "dashed" : "solid" }} />
              {NAME[k]}
            </li>
          ))}
        </ul>
      )}
      {regions.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label={`Marked areas in ${label}`}>
          {regions.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                aria-pressed={pinned === r.key}
                onFocus={() => setHover(r.key)}
                onBlur={() => setHover((a) => (a === r.key ? null : a))}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover((a) => (a === r.key ? null : a))}
                onClick={() => setPinned((a) => (a === r.key ? null : r.key))}
                className="w-full rounded-[5px] border border-line bg-white px-2.5 py-1.5 text-left text-[13px] hover:border-ink/40 aria-pressed:border-ink"
              >
                <span className="mr-1.5 inline-block rounded-[3px] px-1.5 py-px font-mono text-[11px] text-[#fff]" style={{ background: STROKE[r.kind] }}>{r.label}</span>
                {r.summary}
                {r.messages.length > 0 && (
                  <span className="mt-0.5 block text-muted">{r.messages.join(" ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
