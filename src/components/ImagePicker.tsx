"use client";
import { useState } from "react";
import { analyseImage, type ImageInput } from "@/lib/image";
import { Button, inputCls } from "./ui";

export function ImagePicker({ images, onChange }: { images: ImageInput[]; onChange: (i: ImageInput[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList) {
    setError(null);
    const next = [...images];
    for (const f of Array.from(files).slice(0, 4 - images.length)) {
      if (!f.type.startsWith("image/")) { setError(`${f.name} is not an image.`); continue; }
      try {
        next.push(await analyseImage(f, f.name, (s) => setBusy(`${f.name}: ${s}`)));
        onChange([...next]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
  }

  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">Images <span className="font-normal text-muted">Up to 4. Colours and the text inside each image are checked too.</span></legend>
      <div className="space-y-3">
        {images.map((img, i) => (
          <div key={i} className="flex flex-wrap gap-3 rounded-md border border-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.dataUrl} alt={img.alt || `Uploaded image ${i + 1}`} className="h-24 w-24 rounded object-cover" />
            <div className="min-w-0 flex-1 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <b>Image {i + 1}</b><span className="truncate text-muted">{img.name}</span>
                <button type="button" className="ml-auto text-xs text-muted underline hover:text-crit" onClick={() => onChange(images.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {img.colours.map((c) => (
                  <span key={c.hex} className="inline-flex items-center gap-1 rounded border border-line px-1 text-xs"><span className="h-3 w-3 rounded-sm border border-line" style={{ background: c.hex }} aria-hidden />{c.hex} {Math.round(c.share * 100)}%</span>
                ))}
              </div>
              <div className="text-xs text-muted">{img.ocr_ok ? (img.ocr ? <>Text found: “{img.ocr.replace(/\n/g, " ").slice(0, 140)}{img.ocr.length > 140 ? "…" : ""}”</> : "No text found in the image.") : "The text in this image could not be read here, so only its colours are checked."}</div>
              <label className="block">
                <span className="sr-only">Alt text for image {i + 1}</span>
                <input className={inputCls} value={img.alt} placeholder="Alt text: describe the image and repeat any words in it" onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
              </label>
            </div>
          </div>
        ))}
        {images.length < 4 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className={`cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-mist ${busy ? "pointer-events-none opacity-50" : ""}`}>
              Add image
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => e.target.files && add(e.target.files)} />
            </label>
            {[
              { file: "sample-creative.png", label: "Use the sample creative" },
              { file: "sample-creative-fixed.png", label: "Use the corrected sample", alt: "PrepPath Academy creative on a teal background: 4,200+ JEE selections in 2025 from our two-year classroom programme. Past results do not guarantee future selection. Contact admissions@preppath.in." },
            ].map((s) => (
              <Button key={s.file} type="button" variant="ghost" disabled={!!busy} onClick={async () => {
                setBusy(`${s.file}: starting…`);
                try {
                  const blob = await (await fetch(`/${s.file}`)).blob();
                  const img = await analyseImage(blob, s.file, (m) => setBusy(`${s.file}: ${m}`));
                  onChange([...images, { ...img, alt: s.alt ?? "" }]);
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                setBusy(null);
              }}>{s.label}</Button>
            ))}
            {busy && <span role="status" className="text-muted">{busy} The first image takes a few seconds while the text reader loads.</span>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      </div>
    </fieldset>
  );
}
