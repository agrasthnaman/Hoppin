export type OcrWord = { text: string; x: number; y: number; height: number };

type TextItem = { str: string; x: number; y: number };

function linesFromItems(items: readonly TextItem[]): string {
  const rows: { y: number; parts: { x: number; text: string }[] }[] = [];
  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 2);
    if (row) row.parts.push({ x: item.x, text });
    else rows.push({ y: item.y, parts: [{ x: item.x, text }] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(" "),
    )
    .join("\n");
}

/** Words from a drawn page, read left to right along each line. */
export function linesFromWords(words: readonly OcrWord[]): string {
  const usable = words.filter((word) => word.text.trim().length > 0 && word.height > 0);
  if (usable.length === 0) return "";
  const heights = usable.map((word) => word.height).sort((a, b) => a - b);
  const mid = heights[Math.floor(heights.length / 2)] ?? 12;
  const rows: { y: number; parts: OcrWord[] }[] = [];
  for (const word of [...usable].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - word.y) < mid * 0.8);
    if (row) row.parts.push(word);
    else rows.push({ y: word.y, parts: [word] });
  }
  return rows.map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text.trim()).join(" ")).join("\n");
}

function isThin(text: string): boolean {
  return text.replace(/[^A-Za-z]/g, "").length < 40;
}

function textOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("data" in result)) return "";
  const data = result.data;
  if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string") return "";
  return data.text;
}

type PdfPage = {
  getTextContent: () => Promise<{ items: unknown[] }>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<unknown> };
};

type PdfDoc = { numPages: number; getPage: (number: number) => Promise<PdfPage> };

function isPdfDoc(value: unknown): value is PdfDoc {
  return !!value && typeof value === "object" && "numPages" in value && typeof value.numPages === "number" && "getPage" in value && typeof value.getPage === "function";
}

function textItem(value: unknown): TextItem | null {
  if (!value || typeof value !== "object" || !("str" in value) || !("transform" in value)) return null;
  const transform = value.transform;
  if (!transform || typeof transform !== "object" || !("4" in transform) || !("5" in transform)) return null;
  const x = transform[4];
  const y = transform[5];
  if (typeof x !== "number" || typeof y !== "number" || typeof value.str !== "string") return null;
  return { str: value.str, x, y };
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

async function textFrom(pdf: PdfDoc): Promise<string> {
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) => {
      const text = textItem(item);
      return text ? [text] : [];
    });
    pages.push(linesFromItems(items));
  }
  return pages.join("\n");
}

async function ocrFrom(pdf: PdfDoc): Promise<string> {
  const tesseract = await import("tesseract.js");
  const workerFile = await import("tesseract.js/dist/worker.min.js?url");
  const worker = await tesseract.createWorker("eng", undefined, { workerPath: workerFile.default });
  const pages: string[] = [];
  try {
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK });
    const last = Math.min(pdf.numPages, 2);
    for (let number = 1; number <= last; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push(textOf(await worker.recognize(canvas)));
      if (!isThin(pages.join("\n"))) break;
    }
  } finally {
    await worker.terminate();
  }
  return pages.join("\n");
}

/** The words in a PDF, one visual line at a time. A drawn ticket is read from the page image. */
export async function readPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  if (!isPdfDoc(pdf)) return "";
  const text = await textFrom(pdf);
  if (!isThin(text)) return text;
  try {
    const recognized = await ocrFrom(pdf);
    if (recognized.trim()) return recognized;
  } catch {
    // Recognition needs a connection the first time. The text layer is the fallback.
  }
  return text;
}
