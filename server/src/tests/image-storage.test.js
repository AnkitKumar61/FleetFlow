import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  buildSrc: vi.fn(),
  toFile: vi.fn(),
  options: null
}));

vi.mock('../config/env.js', () => ({ env: { IMAGEKIT_PRIVATE_KEY: 'private-key', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/fleetflow' } }));
vi.mock('@imagekit/nodejs', () => ({
  default: function MockImageKit(options) {
    mocks.options = options;
    return { files: { upload: mocks.upload, delete: mocks.remove }, helper: { buildSrc: mocks.buildSrc } };
  },
  toFile: mocks.toFile
}));

import { createSignedProofUrl, deleteProofImage, uploadProofImage } from '../services/image-storage.service.js';

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ fileId: 'imagekit-file', filePath: '/fleetflow/proofs/ff-1005-proof.png' });
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.buildSrc.mockReset().mockReturnValue('https://signed.example/proof');
  mocks.toFile.mockReset().mockResolvedValue({ uploadable: true });
});

describe('ImageKit proof storage', () => {
  it('uploads a verified image as a private uniquely named proof file', async () => {
    const buffer = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const result = await uploadProofImage({ file: { buffer, originalname: 'doorstep.png', mimetype: 'image/png' }, trackingNumber: 'FF-1005' });

    expect(mocks.options).toMatchObject({ privateKey: 'private-key', timeout: 20000, maxRetries: 2 });
    expect(mocks.toFile).toHaveBeenCalledWith(buffer, 'ff-1005-proof.png', { type: 'image/png' });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ folder: '/fleetflow/proofs', isPrivateFile: true, useUniqueFileName: true }));
    expect(result).toEqual({ provider: 'imagekit', fileId: 'imagekit-file', filePath: '/fleetflow/proofs/ff-1005-proof.png', originalName: 'doorstep.png' });
  });

  it('rejects a file whose bytes are not a supported image', async () => {
    await expect(uploadProofImage({ file: { buffer: Buffer.from('not-an-image'), originalname: 'fake.png', mimetype: 'image/png' }, trackingNumber: 'FF-1005' })).rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT', statusCode: 422 });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('creates an expiring signed URL and can remove an orphaned upload', async () => {
    expect(createSignedProofUrl('/fleetflow/proofs/private.png')).toEqual({ url: 'https://signed.example/proof', expiresIn: 300 });
    expect(mocks.buildSrc).toHaveBeenCalledWith({ urlEndpoint: 'https://ik.imagekit.io/fleetflow', src: '/fleetflow/proofs/private.png', signed: true, expiresIn: 300 });
    await deleteProofImage('imagekit-file');
    expect(mocks.remove).toHaveBeenCalledWith('imagekit-file');
  });
});
