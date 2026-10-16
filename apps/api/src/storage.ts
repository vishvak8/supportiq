import { Injectable } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class PrivateStorage {
  private readonly bucket = process.env.STORAGE_BUCKET || 'supportiq-private';
  private readonly client = (() => {
    const endpoint =
      process.env.STORAGE_ENDPOINT ||
      (process.env.NODE_ENV === 'production'
        ? undefined
        : 'http://127.0.0.1:9100');
    const accessKeyId =
      process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ROOT_USER;
    const secretAccessKey =
      process.env.STORAGE_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD;
    if (endpoint && (!accessKeyId || !secretAccessKey))
      throw new Error(
        'Set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY for private object storage',
      );
    return new S3Client({
      region: process.env.STORAGE_REGION || 'us-east-1',
      endpoint,
      forcePathStyle: Boolean(endpoint),
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
          throw error;
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
      }
    })();
    return this.ready;
  }

  async put(key: string, bytes: Buffer, mediaType: string) {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: mediaType,
        ContentDisposition: 'attachment',
        ...(process.env.STORAGE_SERVER_SIDE_ENCRYPTION === 'AES256'
          ? { ServerSideEncryption: 'AES256' as const }
          : {}),
      }),
    );
  }

  async get(key: string) {
    await this.ensureBucket();
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!object.Body) throw new Error('Stored object is empty');
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.ensureBucket();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
