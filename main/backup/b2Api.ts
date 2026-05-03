/**
 * BackBlaze B2 client using the S3-compatible API.
 *
 * Credentials are read from build-time environment variables:
 *   BACKBLAZE_KEYID            — Application Key ID  (aws_access_key_id)
 *   BACKBLAZE_APPLICATION_KEY  — Application Key     (aws_secret_access_key)
 *   BACKBLAZE_ENDPOINT         — S3 endpoint host    (e.g. s3.us-east-005.backblazeb2.com)
 *   BACKBLAZE_KEYNAME          — Bucket name
 *
 * Uses @aws-sdk/client-s3 which understands S3-compatible endpoints.
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type B2Object = {
  key: string;
  lastModified: Date | undefined;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isB2Configured(): boolean {
  return !!(
    process.env.BACKBLAZE_KEYID?.trim() &&
    process.env.BACKBLAZE_APPLICATION_KEY?.trim() &&
    process.env.BACKBLAZE_ENDPOINT?.trim() &&
    process.env.BACKBLAZE_BUCKET?.trim()
  );
}

function getB2Config() {
  const keyId = process.env.BACKBLAZE_KEYID?.trim() ?? '';
  const appKey = process.env.BACKBLAZE_APPLICATION_KEY?.trim() ?? '';
  const endpointHost = process.env.BACKBLAZE_ENDPOINT?.trim() ?? '';
  const bucket = process.env.BACKBLAZE_BUCKET?.trim() ?? '';

  if (!keyId || !appKey || !endpointHost || !bucket) {
    throw new Error(
      'BackBlaze B2 is not configured. Set BACKBLAZE_KEYID, BACKBLAZE_APPLICATION_KEY, BACKBLAZE_ENDPOINT and BACKBLAZE_BUCKET.'
    );
  }

  // Extract region from endpoint, e.g. "s3.us-east-005.backblazeb2.com" → "us-east-005"
  const regionMatch = endpointHost.match(/s3\.([^.]+)\./);
  const region = regionMatch?.[1] ?? 'us-east-005';

  const endpoint = endpointHost.startsWith('https://')
    ? endpointHost
    : `https://${endpointHost}`;

  return { keyId, appKey, endpoint, region, bucket };
}

function createClient(): S3Client {
  const { keyId, appKey, endpoint, region } = getB2Config();

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
    // Required for B2: path-style URLs (https://endpoint/bucket/key)
    forcePathStyle: true,
    // Retry up to 3 times on transient network errors (EPIPE, ECONNRESET, etc.)
    maxAttempts: 3,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Uploads a buffer to BackBlaze B2 under the given key.
 */
export async function uploadObject(opts: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<void> {
  const { bucket } = getB2Config();
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType ?? 'application/octet-stream',
      // Explicitly set ContentLength so B2 receives a non-chunked upload.
      // Without this the AWS SDK uses chunked transfer encoding which B2 can
      // reject mid-stream, producing a "write EPIPE" error.
      ContentLength: opts.body.length,
    })
  );
}

/**
 * Lists all objects whose key starts with `prefix`.
 * Returns them sorted by LastModified ascending.
 */
export async function listObjects(prefix: string): Promise<B2Object[]> {
  const { bucket } = getB2Config();
  const client = createClient();

  const results: B2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        results.push({ key: obj.Key, lastModified: obj.LastModified });
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  results.sort(
    (a, b) =>
      (a.lastModified?.getTime() ?? 0) - (b.lastModified?.getTime() ?? 0)
  );

  return results;
}

/**
 * Deletes an object by key.
 */
export async function deleteObject(key: string): Promise<void> {
  const { bucket } = getB2Config();
  const client = createClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
