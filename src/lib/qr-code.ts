import QRCode from "qrcode";

/** Generate QR data locally; no third-party QR endpoint receives the encoded URL. */
export async function generateCalerisQrCode(value: string): Promise<string> {
  const content = value.trim();
  if (!content) throw new Error("QR content is required.");
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
    color: { dark: "#171717", light: "#FFFFFF" },
  });
}
