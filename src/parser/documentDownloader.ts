/**
 * src/parser/documentDownloader.ts
 *
 * Downloads RFP attachment files (PDF, DOCX) from URLs stored in the
 * opportunity's attachments_json field.
 *
 * - Max 5 concurrent downloads (semaphore via counter)
 * - 60-second timeout per file
 * - Errors on individual files are caught and logged; others continue
 *
 * Log format: [TIMESTAMP] [parser] [download] [STATUS]
 */

import axios from 'axios';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DownloadedFile {
  url: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

/**
 * Derive a best-effort filename from a URL.
 * Strips query strings and falls back to "attachment" if nothing is found.
 */
function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    return base.trim() !== '' ? base : 'attachment';
  } catch {
    return 'attachment';
  }
}

/**
 * Map a Content-Type response header to a clean MIME type string.
 * Falls back to guessing from the filename extension.
 */
function resolveMimeType(contentType: string | undefined, filename: string): string {
  if (contentType) {
    // Take only the primary type (strip charset=... etc.)
    return contentType.split(';')[0]?.trim() ?? 'application/octet-stream';
  }

  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === '.doc') return 'application/msword';
  return 'application/octet-stream';
}

// ─────────────────────────────────────────────────────────────
// Concurrency limiter (simple semaphore — avoids extra deps)
// ─────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 5;

/** Wraps a factory in a semaphore that allows at most MAX_CONCURRENT simultaneous calls. */
function makeLimiter(max: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  function tryNext(): void {
    if (running < max && queue.length > 0) {
      running++;
      const next = queue.shift();
      next?.();
    }
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            tryNext();
          });
      };

      if (running < max) {
        running++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

const limit = makeLimiter(MAX_CONCURRENT);

// ─────────────────────────────────────────────────────────────
// Core download logic
// ─────────────────────────────────────────────────────────────

async function downloadSingle(
  opportunityId: string,
  url: string
): Promise<DownloadedFile | null> {
  const filename = filenameFromUrl(url);

  console.log(
    `[${ts()}] [parser] [download] [starting — opportunity=${opportunityId} file=${filename}]`
  );

  try {
    const response = await axios.get<Buffer>(url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SparkBid/1.0)',
      },
    });

    const contentType = response.headers['content-type'] as string | undefined;
    const mimeType = resolveMimeType(contentType, filename);
    const buffer = Buffer.from(response.data);

    console.log(
      `[${ts()}] [parser] [download] [success — ${filename} ${buffer.length} bytes mime=${mimeType}]`
    );

    return { url, filename, mimeType, buffer };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [parser] [download] [failed — ${filename} — ${message}]`
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Download all attachment URLs for a given opportunity.
 *
 * Up to MAX_CONCURRENT downloads run at the same time.
 * If any single file fails, it is skipped and the rest continue.
 *
 * @param opportunityId - Used for logging context only
 * @param urls          - List of attachment/resource URLs to download
 * @returns Array of successfully downloaded files (failures are omitted)
 */
export async function downloadAttachments(
  opportunityId: string,
  urls: string[]
): Promise<DownloadedFile[]> {
  if (urls.length === 0) {
    console.log(
      `[${ts()}] [parser] [download] [no attachments — opportunity=${opportunityId}]`
    );
    return [];
  }

  console.log(
    `[${ts()}] [parser] [download] [queuing ${urls.length} file(s) — opportunity=${opportunityId}]`
  );

  const results = await Promise.all(
    urls.map((url) => limit(() => downloadSingle(opportunityId, url)))
  );

  const downloaded = results.filter((r): r is DownloadedFile => r !== null);

  console.log(
    `[${ts()}] [parser] [download] [complete — ${downloaded.length}/${urls.length} succeeded — opportunity=${opportunityId}]`
  );

  return downloaded;
}
