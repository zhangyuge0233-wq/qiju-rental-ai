/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ImageProcessingError,
  compressImage,
  downloadBlob,
  validateImage,
} from '../../src/lib/images';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('validateImage', () => {
  it('拒绝非图片文件', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    expect(validateImage(file)).toEqual({ ok: false, message: '仅支持 JPG、PNG 或 WebP 图片' });
  });

  it('接受 JPG 图片', () => {
    const file = new File(['x'], 'room.jpg', { type: 'image/jpeg' });

    expect(validateImage(file)).toEqual({ ok: true });
  });

  it('拒绝超过 15 MB 的图片', () => {
    const file = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    });

    expect(validateImage(file)).toEqual({ ok: false, message: '图片大小不能超过 15 MB' });
  });
});

describe('compressImage', () => {
  it('压缩超长 JPEG 并释放位图和画布资源', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(new Blob(['compressed'], { type: 'image/jpeg' })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4096, height: 2048, close }),
    );
    const file = new File(['image'], 'wide.jpg', { type: 'image/jpeg' });

    const result = await compressImage(file);

    expect(result.type).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1024);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.86);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('无法解码图片时抛出中文处理错误', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    const file = new File(['image'], 'broken.jpg', { type: 'image/jpeg' });

    await expect(compressImage(file)).rejects.toEqual(
      new ImageProcessingError('图片无法解析，请更换后重试'),
    );
  });
});

describe('downloadBlob', () => {
  it('下载完成后回收临时 URL', () => {
    const createObjectURL = vi.fn(() => 'blob:download');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadBlob(new Blob(['图片']), '改造方案.jpg');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});
