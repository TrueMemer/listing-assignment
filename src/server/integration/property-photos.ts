import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { photoFilenameSchema } from "../../domain/catalog";
import { AppError } from "../domain/errors";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

export async function readPhotoUpload(
  request: Request,
): Promise<{ bytes: Buffer; sourceVersion: number }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload a JPEG, PNG or WebP file as multipart form data.",
      415,
    );
  if (Number(request.headers.get("content-length")) > MAX_MULTIPART_BYTES)
    throw new AppError(
      "PHOTO_TOO_LARGE",
      "Choose a photo no larger than 5 MiB.",
      413,
    );
  if (!request.body)
    throw new AppError("INVALID_PHOTO", "Choose a photo to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new AppError(
          "PHOTO_TOO_LARGE",
          "Choose a photo no larger than 5 MiB.",
          413,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "INVALID_PHOTO",
      "The upload was interrupted. Please retry.",
    );
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new AppError("INVALID_PHOTO", "The photo upload could not be read.");
  }
  const keys = [...form.keys()];
  if (
    keys.length !== 2 ||
    !keys.includes("file") ||
    !keys.includes("sourceVersion")
  )
    throw new AppError(
      "INVALID_PHOTO",
      "Send one photo and the current property version.",
    );
  const file = form.get("file");
  const version = form.get("sourceVersion");
  if (
    !(file instanceof Blob) ||
    typeof version !== "string" ||
    !/^[1-9]\d*$/.test(version) ||
    !Number.isSafeInteger(Number(version))
  )
    throw new AppError(
      "INVALID_PHOTO",
      "Send one photo and the current property version.",
    );
  if (file.size > MAX_PHOTO_BYTES)
    throw new AppError(
      "PHOTO_TOO_LARGE",
      "Choose a photo no larger than 5 MiB.",
      413,
    );
  if (!file.size)
    throw new AppError("INVALID_PHOTO", "The selected photo is empty.");
  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    sourceVersion: Number(version),
  };
}

function supportedMagic(bytes: Buffer): boolean {
  return (
    (bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP")
  );
}

export class PropertyPhotoStore {
  private active = false;
  constructor(private readonly directory: string) {}

  async write(bytes: Buffer): Promise<{ filename: string; imagePath: string }> {
    if (bytes.byteLength > MAX_PHOTO_BYTES)
      throw new AppError(
        "PHOTO_TOO_LARGE",
        "Choose a photo no larger than 5 MiB.",
        413,
      );
    if (!supportedMagic(bytes))
      throw new AppError(
        "INVALID_PHOTO",
        "Choose a valid JPEG, PNG or WebP image. SVG and HTML files are not accepted.",
      );
    if (this.active)
      throw new AppError(
        "PHOTO_BUSY",
        "Another photo is being processed. Please retry shortly.",
        429,
      );
    this.active = true;
    try {
      let encoded: Buffer;
      try {
        const image = sharp(bytes, {
          limitInputPixels: 16_000_000,
          failOn: "warning",
          animated: false,
        });
        const metadata = await image.metadata();
        if (
          !metadata.format ||
          !["jpeg", "png", "webp"].includes(metadata.format) ||
          !metadata.width ||
          !metadata.height ||
          metadata.width > 8192 ||
          metadata.height > 8192 ||
          (metadata.pages ?? 1) > 1
        )
          throw new Error("Unsupported photo dimensions");
        // Re-encoding strips EXIF, GPS and other original metadata by default.
        encoded = await image
          .rotate()
          .resize({
            width: 1600,
            height: 1200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .timeout({ seconds: 10 })
          .toBuffer();
      } catch {
        throw new AppError(
          "INVALID_PHOTO",
          "The image could not be decoded safely. Use a JPEG, PNG or WebP up to 16 megapixels.",
        );
      }
      if (encoded.byteLength > MAX_PHOTO_BYTES)
        throw new AppError(
          "PHOTO_TOO_LARGE",
          "The processed photo is too large.",
          413,
        );
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const filename = `${randomUUID()}.webp`;
      const file = await open(join(this.directory, filename), "wx", 0o600);
      try {
        await file.writeFile(encoded);
      } finally {
        await file.close();
      }
      return { filename, imagePath: `/api/photos/${filename}` };
    } finally {
      this.active = false;
    }
  }

  async read(filename: string): Promise<Buffer> {
    if (!photoFilenameSchema.safeParse(filename).success)
      throw new AppError("NOT_FOUND", "This photo was not found.", 404);
    try {
      const file = await open(
        join(this.directory, filename),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > MAX_PHOTO_BYTES)
          throw new Error("Invalid stored photo");
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch {
      throw new AppError("NOT_FOUND", "This photo was not found.", 404);
    }
  }

  async remove(filename: string): Promise<void> {
    if (photoFilenameSchema.safeParse(filename).success)
      await rm(join(this.directory, filename), { force: true });
  }
}
