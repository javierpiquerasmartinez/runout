/*
 * Where a Bulk Import's files are kept between the upload and the import.
 * The browser uploads them straight to it, in parts, with presigned URLs;
 * the import service reads them back as a stream. One small interface, so
 * that the storage behind it can be replaced.
 */

/** A part already uploaded, as completing the upload names it. */
export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface FileStore {
  /** Starts a multipart upload of the file stored at `key`; returns its upload id. */
  startUpload(key: string): Promise<string>;
  /** A URL per part number, each taking that part's bytes in a PUT. */
  partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ partNumber: number; url: string }[]>;
  /** The parts the upload already has, so that an interrupted one resumes. */
  uploadedParts(key: string, uploadId: string): Promise<UploadedPart[]>;
  /** Joins the parts into the stored file. */
  completeUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void>;
  /** The stored file's bytes, as they stream in. */
  read(key: string): AsyncIterable<Uint8Array>;
  /** Removes the file, or the unfinished upload, at `key`. */
  delete(key: string, uploadId?: string): Promise<void>;
}

/** The file store, or null where none is configured. */
export const FILE_STORE = Symbol('FILE_STORE');

/** Refused when an upload names a part the store never received. */
export class UnknownPart extends Error {}
