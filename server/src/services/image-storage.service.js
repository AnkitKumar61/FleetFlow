import path from 'node:path';
import ImageKit, { toFile } from '@imagekit/nodejs';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

const SIGNED_URL_SECONDS = 300;
let client;

export function isProofImageStorageConfigured() {
  return Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT);
}

function configuredClient() {
  if (!isProofImageStorageConfigured()) {
    throw new AppError(503, 'IMAGE_STORAGE_NOT_CONFIGURED', 'Proof image storage is not configured');
  }
  client ??= new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY, timeout: 20000, maxRetries: 2 });
  return client;
}

function isSupportedImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const header = buffer.subarray(0, 12).toString('hex');
  return header.startsWith('ffd8ff')
    || header.startsWith('89504e470d0a1a0a')
    || (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP');
}

export async function uploadProofImage({ file, trackingNumber }) {
  if (!isSupportedImage(file?.buffer)) {
    throw new AppError(422, 'INVALID_FILE_CONTENT', 'The proof attachment is not a valid JPEG, PNG, or WebP image');
  }
  const extension = path.extname(file.originalname).toLowerCase();
  const safeExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) ? extension : '.jpg';
  const fileName = `${trackingNumber.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-proof${safeExtension}`;
  try {
    const result = await configuredClient().files.upload({
      file: await toFile(file.buffer, fileName, { type: file.mimetype }),
      fileName,
      folder: '/fleetflow/proofs',
      isPrivateFile: true,
      useUniqueFileName: true,
      tags: ['fleetflow', 'delivery-proof'],
      responseFields: ['isPrivateFile']
    });
    if (!result.fileId || !result.filePath) throw new Error('ImageKit did not return a file identifier and path');
    return { provider: 'imagekit', fileId: result.fileId, filePath: result.filePath, originalName: file.originalname };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'IMAGE_UPLOAD_FAILED', 'The proof image could not be stored. Please try again');
  }
}

export async function deleteProofImage(fileId) {
  if (fileId) await configuredClient().files.delete(fileId);
}

export function createSignedProofUrl(filePath) {
  return {
    url: configuredClient().helper.buildSrc({
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
      src: filePath,
      signed: true,
      expiresIn: SIGNED_URL_SECONDS
    }),
    expiresIn: SIGNED_URL_SECONDS
  };
}
