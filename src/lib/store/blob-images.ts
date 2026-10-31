import { SAFE_IMAGE_FILE, imageFileName, type RunStore } from "./types";

/**
 * Generated images in object storage instead of the run store. Each image is
 * about 0.5–0.8 MB; in Postgres they all travel through the database.
 *
 * Images are stored private: they have no public URL and are still served only
 * through /api/runs/[id]/image, behind the app's sign-in.
 */
export interface ImageBlobs {
  save(path: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  /** The bytes, or null when there is no such image. */
  read(path: string): Promise<Uint8Array | null>;
}

const PREFIX = "hireloop/images/";

/**
 * The same store with images moved to `blobs`. Images saved before the switch
 * still load: a file missing from the blob store is read from the base store.
 */
export function withBlobImages(base: RunStore, blobs: ImageBlobs): RunStore {
  return {
    ...base,
    async saveImage(runId, bytes, mediaType) {
      const file = imageFileName(runId, mediaType);
      await blobs.save(PREFIX + file, bytes, mediaType);
      return file;
    },
    async readImage(file) {
      if (!SAFE_IMAGE_FILE.test(file)) return null;
      const bytes = await blobs.read(PREFIX + file);
      return bytes ? Buffer.from(bytes) : base.readImage(file);
    },
  };
}

/** Vercel Blob (BLOB_READ_WRITE_TOKEN), loaded only when configured. */
export function vercelBlobs(): ImageBlobs {
  const sdk = () => import("@vercel/blob");
  return {
    async save(path, bytes, mediaType) {
      const { put } = await sdk();
      await put(path, Buffer.from(bytes), { access: "private", contentType: mediaType, addRandomSuffix: false, allowOverwrite: true });
    },
    async read(path) {
      const { get, BlobNotFoundError } = await sdk();
      try {
        const res = await get(path, { access: "private" });
        if (!res || res.statusCode !== 200) return null;
        return new Uint8Array(await new Response(res.stream).arrayBuffer());
      } catch (err) {
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
    },
  };
}
