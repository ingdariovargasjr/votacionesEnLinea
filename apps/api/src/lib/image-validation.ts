export function imageHasExpectedSignature(file: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  if (mimeType === "image/png") return file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return file.length >= 12 && file.toString("ascii", 0, 4) === "RIFF" && file.toString("ascii", 8, 12) === "WEBP";
  return false;
}
