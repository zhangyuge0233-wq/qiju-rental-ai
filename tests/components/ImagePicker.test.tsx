/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImagePicker } from '../../src/components/ImagePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImagePicker', () => {
  it('在标题后显示必填标记', () => {
    render(
      <ImagePicker label="房间照片" required value={undefined} onChange={vi.fn()} onError={vi.fn()} />,
    );

    expect(screen.getByText('房间照片')).toBeTruthy();
    expect(screen.getByText('必填')).toBeTruthy();
  });

  it('默认调性图只作示例且不会触发上传', () => {
    const onChange = vi.fn();

    render(
      <ImagePicker
        label="参考图"
        required={false}
        defaultImageSrc="/style-example.jpg"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByAltText('默认参考图示例')).toBeTruthy();
    expect(screen.getByText('示例图，请上传参考图')).toBeTruthy();
    expect(screen.getByText('选填')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('仅为已有的可选图片提供中文移除操作', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:reference'), revokeObjectURL: vi.fn() });

    const { rerender } = render(
      <ImagePicker
        label="风格参考图"
        required={false}
        value={new Blob(['reference'], { type: 'image/png' })}
        onChange={vi.fn()}
        onRemove={onRemove}
        onError={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '移除参考图' }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <ImagePicker
        label="房间照片"
        required
        value={new Blob(['room'], { type: 'image/jpeg' })}
        onChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '移除房间照片' })).toBeNull();
  });

  it('按回车可触发文件选择', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

    render(
      <ImagePicker label="房间照片" required value={undefined} onChange={vi.fn()} onError={vi.fn()} />,
    );

    screen.getByRole('button', { name: '选择图片' }).focus();
    await user.keyboard('{Enter}');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('文件不合规时保留已有有效图片', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const createObjectURL = vi.fn(() => 'blob:existing');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const onChange = vi.fn();
    const onError = vi.fn();

    render(
      <ImagePicker
        label="房间照片"
        required
        value={new Blob(['ok'], { type: 'image/jpeg' })}
        onChange={onChange}
        onError={onError}
      />,
    );

    await user.upload(
      screen.getByLabelText('房间照片图片选择'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    );

    expect(onError).toHaveBeenCalledWith('仅支持 JPG、PNG 或 WebP 图片');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByAltText('已上传的房间照片')).toBeTruthy();
  });

  it('合规图片压缩后交给调用方', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 20, height: 10, close: vi.fn() }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['compressed'], { type: 'image/jpeg' }));
    });
    const onChange = vi.fn();

    render(
      <ImagePicker label="房间照片" required value={undefined} onChange={onChange} onError={vi.fn()} />,
    );

    await user.upload(
      screen.getByLabelText('房间照片图片选择'),
      new File(['image'], 'room.jpg', { type: 'image/jpeg' }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.any(Blob)));
  });

  it('后选择的图片完成后不会被先前的慢任务覆盖', async () => {
    const user = userEvent.setup();
    const callbacks: BlobCallback[] = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 20, height: 10, close: vi.fn() }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callbacks.push(callback);
    });
    const onChange = vi.fn();

    render(
      <ImagePicker label="房间照片" required value={undefined} onChange={onChange} onError={vi.fn()} />,
    );
    const input = screen.getByLabelText('房间照片图片选择');

    await user.upload(input, new File(['first'], 'first.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(callbacks).toHaveLength(1));
    await user.upload(input, new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(callbacks).toHaveLength(2));

    const secondResult = new Blob(['second-result'], { type: 'image/jpeg' });
    callbacks[1](secondResult);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(secondResult));

    callbacks[0](new Blob(['first-result'], { type: 'image/jpeg' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
