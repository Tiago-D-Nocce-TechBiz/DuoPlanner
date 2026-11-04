import "server-only";

/**
 * Validação do arquivo do recibo enviado em base64 (fronteira de confiança da
 * Server Action). Aceita data URL (`data:image/jpeg;base64,...`) ou base64
 * puro. O tipo real é detectado pelos primeiros bytes ("magic numbers") e
 * prevalece sobre o tipo declarado.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * Limite do arquivo decodificado. Em base64 ele cresce ~33% e precisa caber
 * no limite padrão de 1 MB do corpo das Server Actions (mantido de propósito
 * em next.config.ts). O navegador reduz as fotos antes de enviar.
 */
export const MAX_RECEIPT_BYTES = 700 * 1024;

export type ParsedUpload =
  | { ok: true; mimeType: string; base64: string; bytes: number }
  | { ok: false; message: string };

function sniffMime(head: Buffer): string | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (head.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  if (head.toString("ascii", 4, 8) === "ftyp") {
    const brand = head.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

export function parseBase64Upload(input: unknown): ParsedUpload {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, message: "Envie a foto ou o PDF do recibo." };
  }

  let base64 = input.trim();
  let declared: string | null = null;
  const prefix = /^data:([\w.+-]+\/[\w.+-]+);base64,/i.exec(base64);
  if (prefix) {
    declared = prefix[1].toLowerCase();
    base64 = base64.slice(prefix[0].length);
  }
  base64 = base64.replace(/\s/g, "");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, message: "Arquivo inválido: o conteúdo base64 está corrompido." };
  }

  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  if (bytes < 100) return { ok: false, message: "Arquivo vazio ou corrompido." };
  if (bytes > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      message: "Arquivo grande demais (máximo de 700 KB). Envie uma foto ou um print do comprovante.",
    };
  }

  const mimeType = sniffMime(Buffer.from(base64.slice(0, 64), "base64")) ?? declared;
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    return { ok: false, message: "Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF." };
  }

  return { ok: true, mimeType, base64, bytes };
}
