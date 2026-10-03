import "server-only";

const MAX_BYTES = 300 * 1024;
const DATA_URL = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Validates an e-signature sent from the signature pad: "" means remove it, otherwise it must
 * be a PNG or JPEG data URL under 300 KB. Returns the value to store, or { error }.
 */
export function readSignature(raw: FormDataEntryValue | null): { value: string | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null };
  const m = DATA_URL.exec(s);
  if (!m) return { error: "The signature must be a PNG or JPEG image." };
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return { error: "The signature image is too large (limit 300 KB)." };
  const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if ((m[1] === "png" && !png) || (m[1] === "jpeg" && !jpeg)) return { error: "The signature file isn’t a valid image." };
  return { value: s };
}
