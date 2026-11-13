import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
  type Part,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileStore, UploadedPart } from './file-store.js';

/** How long a part URL lets the browser upload. */
const PART_URL_EXPIRES_IN_SECONDS = 6 * 60 * 60;

export interface R2Settings {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Files in a Cloudflare R2 bucket, through its S3-compatible API. Not covered
 * by automated tests: see the README for checking an upload by hand.
 */
export class R2FileStore implements FileStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(settings: R2Settings) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      // R2 does not take the checksums the SDK adds by default, and a
      // presigned part URL could not carry the browser's anyway.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async startUpload(key: string): Promise<string> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!UploadId) throw new Error(`R2 gave no upload id for ${key}`);
    return UploadId;
  }

  partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ partNumber: number; url: string }[]> {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: PART_URL_EXPIRES_IN_SECONDS },
        ),
      })),
    );
  }

  async uploadedParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) parts.push(uploaded(part));
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(({ partNumber, etag }) => ({
            PartNumber: partNumber,
            ETag: etag,
          })),
        },
      }),
    );
  }

  async *read(key: string): AsyncIterable<Uint8Array> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!Body) throw new Error(`R2 has no file at ${key}`);
    yield* Body as AsyncIterable<Uint8Array>;
  }

  async delete(key: string, uploadId?: string): Promise<void> {
    if (uploadId) {
      await this.client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        )
        // Already completed or aborted: nothing left to abort.
        .catch(() => undefined);
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function uploaded(part: Part): UploadedPart {
  return { partNumber: part.PartNumber!, etag: part.ETag! };
}
