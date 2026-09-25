import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createServiceClient } from '@/lib/supabase/server';

export type AttachmentStorageProvider = 'supabase' | 's3';

export type AttachmentStorageRef = {
  storage_provider: AttachmentStorageProvider;
  storage_bucket: string;
  storage_key: string;
};

const SUPABASE_BUCKET = 'proposition-attachments';

function configuredProvider(): AttachmentStorageProvider {
  const value = process.env.ATTACHMENTS_STORAGE_PROVIDER?.trim().toLowerCase() || 'supabase';
  if (value !== 'supabase' && value !== 's3') {
    throw new Error('ATTACHMENTS_STORAGE_PROVIDER doit être "supabase" ou "s3"');
  }
  return value;
}

function s3Config() {
  const bucket = process.env.ATTACHMENTS_S3_BUCKET?.trim();
  const region = process.env.ATTACHMENTS_S3_REGION?.trim();
  const accessKeyId = process.env.ATTACHMENTS_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.ATTACHMENTS_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Configuration S3 des pièces jointes incomplète');
  }
  return {
    bucket,
    client: new S3Client({
      region,
      endpoint: process.env.ATTACHMENTS_S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.ATTACHMENTS_S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function getAttachmentUploadProvider(): AttachmentStorageProvider {
  return configuredProvider();
}

export async function uploadAttachmentObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<AttachmentStorageRef> {
  const provider = configuredProvider();
  if (provider === 'supabase') {
    const supabase = createServiceClient();
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(input.key, input.body, {
      contentType: input.contentType,
      upsert: false,
    });
    if (error) throw error;
    return {
      storage_provider: 'supabase',
      storage_bucket: SUPABASE_BUCKET,
      storage_key: input.key,
    };
  }

  const { bucket, client } = s3Config();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
  }));
  return { storage_provider: 's3', storage_bucket: bucket, storage_key: input.key };
}

export async function createAttachmentDownloadUrl(ref: AttachmentStorageRef): Promise<string> {
  if (ref.storage_provider === 'supabase') {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(ref.storage_bucket)
      .createSignedUrl(ref.storage_key, 60);
    if (error || !data?.signedUrl) throw error ?? new Error('URL de téléchargement indisponible');
    return data.signedUrl;
  }

  const { client } = s3Config();
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: ref.storage_bucket,
    Key: ref.storage_key,
  }), { expiresIn: 60 });
}

export async function deleteAttachmentObject(ref: AttachmentStorageRef): Promise<void> {
  if (ref.storage_provider === 'supabase') {
    const supabase = createServiceClient();
    const { error } = await supabase.storage.from(ref.storage_bucket).remove([ref.storage_key]);
    if (error) throw error;
    return;
  }

  const { client } = s3Config();
  await client.send(new DeleteObjectCommand({
    Bucket: ref.storage_bucket,
    Key: ref.storage_key,
  }));
}
