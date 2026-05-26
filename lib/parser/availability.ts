/**
 * Whether the PDF statement parser can run in this deployment.
 *
 * Parsing spawns Python + poppler (parser/extract.py). Those exist on the local
 * desktop but NOT on Vercel's serverless runtime, which has no Python, no
 * poppler, and can't spawn child processes. So uploads are a desktop-only
 * capability: when hosted, the /upload page shows a "run locally" notice instead
 * of a dropzone, and the upload/preview routes refuse with a clear message.
 *
 * Detection: Vercel sets `process.env.VERCEL`. `PARSER_ENABLED` overrides either
 * way — set "1"/"true" to force on (e.g. a self-hosted box with Python), or
 * "0"/"false" to force off.
 */
export function parserAvailable(): boolean {
  const flag = process.env.PARSER_ENABLED?.toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return !process.env.VERCEL;
}

/** Message shown when uploads are unavailable (hosted runtime). */
export const PARSER_UNAVAILABLE_MESSAGE =
  'Statement parsing runs on the desktop app (it needs Python + poppler, which the hosted server lacks). Open Vault on the computer where the parser is installed to upload statements; everything else works here.';
