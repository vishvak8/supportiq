import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { storageFailureDiagnostic } from './storage-diagnostics.js';

function isSupabaseStorageEndpoint(endpoint: string | undefined) {
  if (!endpoint) return false;
  try {
    return new URL(endpoint).hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

@Injectable()
export class PrivateStorage {
  private readonly logger = new Logger(PrivateStorage.name);
  private readonly bucket = process.env.STORAGE_BUCKET || 'supportiq-private';
  private readonly region = process.env.STORAGE_REGION || 'us-east-1';
  private readonly endpoint =
    process.env.STORAGE_ENDPOINT ||
    (process.env.NODE_ENV === 'production'
      ? undefined
      : 'http://127.0.0.1:9100');
  private readonly isSupabaseEndpoint = isSupabaseStorageEndpoint(
    this.endpoint,
  );
  private readonly credentialsConfigured = Boolean(
    (process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ROOT_USER) &&
    (process.env.STORAGE_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD),
  );
  private readonly client = (() => {
    const accessKeyId =
      process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ROOT_USER;
    const secretAccessKey =
      process.env.STORAGE_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD;
    if (this.endpoint && (!accessKeyId || !secretAccessKey))
      throw new Error(
        'Set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY for private object storage',
      );
    return new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: Boolean(this.endpoint),
      // Supabase S3 does not implement optional PutObject checksum headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  })();
  private ready?: Promise<void>;

  private ensureBucket() {
    this.ready ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status !== 404 || process.env.NODE_ENV === 'production')
          this.fail('head_bucket', error);
        try {
          await this.client.send(
            new CreateBucketCommand({ Bucket: this.bucket }),
          );
        } catch (createError) {
          this.fail('create_bucket', createError);
        }
      }
    })();
    return this.ready;
  }

  private fail(operation: string, error: unknown): never {
    this.logger.warn(
      JSON.stringify(
        storageFailureDiagnostic(error, {
          operation,
          endpoint: this.endpoint,
          region: this.region,
          bucket: this.bucket,
          credentialsConfigured: this.credentialsConfigured,
        }),
      ),
    );
    // Avoid forwarding AWS SDK messages, which may contain request details.
    throw new Error(`Private storage ${operation} failed`);
  }

  async put(key: string, bytes: Buffer, mediaType: string) {
    await this.ensureBucket();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: mediaType,
          ContentDisposition: 'attachment',
          ...(process.env.STORAGE_SERVER_SIDE_ENCRYPTION === 'AES256' &&
          !this.isSupabaseEndpoint
            ? { ServerSideEncryption: 'AES256' as const }
            : {}),
        }),
      );
    } catch (error) {
      this.fail('put_object', error);
    }
  }

  async get(key: string) {
    await this.ensureBucket();
    let object;
    try {
      object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.fail('get_object', error);
    }
    if (!object.Body) throw new Error('Stored object is empty');
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.ensureBucket();
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.fail('delete_object', error);
    }
  }
}
