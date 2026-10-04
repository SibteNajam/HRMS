/**
 * Getting text out of a CV.
 *
 * Nothing here calls a model. Extraction is mechanical, and a model asked
 * to "read" a PDF would be guessing at bytes it cannot see — it reads the
 * text this produces, which is a different job.
 */

export type CvFormat = 'pdf' | 'docx' | 'text';

export class UnreadableCv extends Error {}

const BY_MIME: Record<string, CvFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'text',
};

const BY_EXTENSION: Record<string, CvFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'text',
};

/**
 * Format from the declared type, falling back to the file name.
 *
 * Mail clients are careless with MIME types — a PDF arriving as
 * `application/octet-stream` is common enough that refusing it would lose
 * real applications.
 */
export function formatOf(fileName: string, mimeType?: string): CvFormat | null {
  if (mimeType && BY_MIME[mimeType]) return BY_MIME[mimeType];
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

/** The shortest text worth scoring. Below this, something went wrong. */
export const MIN_USABLE_CHARS = 200;

export async function extractText(
  file: Buffer,
  fileName: string,
  mimeType?: string,
): Promise<string> {
  const format = formatOf(fileName, mimeType);
  if (!format) {
    throw new UnreadableCv(
      `"${fileName}" is not a format I can read. Send a PDF, a Word document or plain text.`,
    );
  }

  let text: string;
  try {
    text = await readAs(format, file);
  } catch (err) {
    throw new UnreadableCv(
      `"${fileName}" could not be opened — it may be corrupt or password protected.` +
        (err instanceof Error ? ` (${err.message})` : ''),
    );
  }

  const cleaned = tidy(text);

  // A scanned CV is a picture of words: the file opens, the text is empty.
  // Saying so beats scoring a blank page at zero and calling it a bad fit.
  if (cleaned.length < MIN_USABLE_CHARS) {
    throw new UnreadableCv(
      `"${fileName}" has almost no readable text — it is probably a scan or ` +
        `an image. A text PDF or Word document can be read.`,
    );
  }

  return cleaned;
}

async function readAs(format: CvFormat, file: Buffer): Promise<string> {
  if (format === 'text') return file.toString('utf8');

  if (format === 'pdf') {
    // pdf-parse v2 is a class with an explicit lifecycle, not the v1
    // one-shot function. `destroy` releases the worker, so it runs whether
    // extraction succeeded or threw.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(file) });
    try {
      const { text } = await parser.getText();
      return text;
    } finally {
      await parser.destroy();
    }
  }

  const { default: mammoth } = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: file });
  return value;
}

/**
 * PDF extraction produces ragged whitespace — a two-column CV interleaves
 * badly and every blank line survives. Collapsing it keeps the prompt small
 * and the text readable.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * CVs run long and the prompt has a budget. The first part carries the
 * name, contact details, current role and recent experience — which is what
 * the score rests on. Older history matters less and costs the same.
 */
export function forScoring(text: string, maxChars = 12_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated — CV continues]`;
}
