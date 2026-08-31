import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET = env.AWS_BUCKET_NAME;

/**
 * Upload a file to S3 and return its public URL.
 * @param key      S3 object key (e.g. "exam-papers/images/xxxx.png")
 * @param body     File buffer or string
 * @param contentType MIME type of the file
 */
export async function uploadToS3(key: string, body: Buffer | string, contentType: string): Promise<string> {
    await s3Client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
        })
    );
    return `${env.AWS_S3_PUBLIC_URL}/${key}`;
}

/**
 * Delete a file from S3.
 */
export async function deleteFromS3(key: string): Promise<void> {
    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key,
        })
    );
}

/**
 * Generate a time-limited signed URL for a private object.
 */
export async function getSignedS3Url(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        { expiresIn }
    );
}

/**
 * Build a safe S3 key for an uploaded exam-paper file.
 * Folder structure: exam-papers/{schoolId}/{type}/{timestamp}-{safeFilename}
 */
export function buildExamPaperKey(schoolId: string, type: string, originalName: string): string {
    const safe = originalName.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80);
    const ts = Date.now();
    return `exam-papers/${schoolId}/${type}/${ts}-${safe}`;
}