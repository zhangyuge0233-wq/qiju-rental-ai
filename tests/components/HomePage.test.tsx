/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationController } from '../../src/hooks/use-generation';
import { useGeneration } from '../../src/hooks/use-generation';
import { downloadBlob } from '../../src/lib/images';
import { HomePage } from '../../src/pages/HomePage';

vi.mock('../../src/hooks/use-generation', () => ({ useGeneration: vi.fn() }));
vi.mock('../../src/lib/images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/images')>();
  return { ...actual, downloadBlob: vi.fn() };
});

const mockedUseGeneration = vi.mocked(useGeneration);
const mockedDownloadBlob = vi.mocked(downloadBlob);
const roomImage = new Blob(['room'], { type: 'image/jpeg' });
const referenceImage = new Blob(['reference'], { type: 'image/png' });
const resultImage = new Blob(['result'], { type: 'image/webp' });

function controller(
  overrides: Partial<GenerationController> = {},
): GenerationController {
  return {
    status: 'editing',
    setRoomImage: vi.fn(),
    setReferenceImage: vi.fn(),
    setPresetStyle: vi.fn(),
    generate: vi.fn().mockResolvedValue(undefined),
    resetToEditing: vi.fn(),
    restoreFromHistory: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => blob === roomImage ? 'blob:room' : 'blob:result'),
    revokeObjectURL: vi.fn(),
  });
  mockedUseGeneration.mockReturnValue(controller());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it.each([
    ['没有输入', {}],
    ['只有房间照片', { roomImage }],
    ['只有预设风格', { presetStyle: '奶油风' }],
  ])('%s时禁用生成', (_label, state) => {
    mockedUseGeneration.mockReturnValue(controller(state));

    render(<HomePage />);

    expect(screen.getByRole('button', { name: '生成我的房间' }).hasAttribute('disabled')).toBe(true);
  });

  it.each([
    ['预设风格', { roomImage, presetStyle: '奶油风' }],
    ['参考图', { roomImage, referenceImage }],
    ['预设风格和参考图', { roomImage, referenceImage, presetStyle: '奶油风' }],
  ])('房间照片配合%s时允许生成', (_label, state) => {
    mockedUseGeneration.mockReturnValue(controller(state));

    render(<HomePage />);

    expect(screen.getByRole('button', { name: '生成我的房间' }).hasAttribute('disabled')).toBe(false);
  });

  it('预设与参考图同时存在时明确说明参考图优先级', () => {
    mockedUseGeneration.mockReturnValue(controller({
      roomImage,
      referenceImage,
      presetStyle: '奶油风',
    }));

    render(<HomePage />);

    expect(screen.getByText('参考图将优先影响色彩、材质与氛围')).toBeTruthy();
  });

  it('房间图片错误以中文警告显示且保留先前有效输入', async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockedUseGeneration.mockReturnValue(controller({ roomImage }));

    render(<HomePage />);
    await user.upload(
      screen.getByLabelText('房间照片图片选择'),
      new File(['not-an-image'], 'room.txt', { type: 'text/plain' }),
    );

    expect(screen.getByRole('alert').textContent).toBe('仅支持 JPG、PNG 或 WebP 图片');
    expect(screen.getByAltText('已上传的房间照片')).toBeTruthy();
  });

  it('生成中显示循环状态且不虚构百分比', () => {
    mockedUseGeneration.mockReturnValue(controller({
      status: 'generating',
      roomImage,
      presetStyle: '奶油风',
    }));

    render(<HomePage />);

    expect(screen.getByText('正在重新布置你的房间')).toBeTruthy();
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.getByRole('button', { name: '正在生成，请稍候' }).hasAttribute('disabled')).toBe(true);
  });

  it('结果态使用真实 Blob URL，并在卸载时释放', () => {
    mockedUseGeneration.mockReturnValue(controller({
      status: 'result',
      roomImage,
      resultImage,
      presetStyle: '奶油风',
    }));

    const { unmount } = render(<HomePage />);

    expect(URL.createObjectURL).toHaveBeenCalledWith(roomImage);
    expect(URL.createObjectURL).toHaveBeenCalledWith(resultImage);
    expect(screen.getByAltText('改造后的房间').getAttribute('src')).toBe('blob:result');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:room');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
  });

  it('结果态次要操作在左、深色主下载在右', () => {
    mockedUseGeneration.mockReturnValue(controller({
      status: 'result',
      roomImage,
      resultImage,
      presetStyle: '奶油风',
    }));

    render(<HomePage />);
    const actions = screen.getByRole('group', { name: '效果图操作' });
    const buttons = actions.querySelectorAll('button');

    expect(buttons[0].textContent).toContain('再次生成');
    expect(buttons[1].textContent).toContain('下载效果图');
    expect(buttons[1].classList.contains('button--primary')).toBe(true);
  });

  it('历史保存失败时只显示失败提示而不声称已保存', () => {
    mockedUseGeneration.mockReturnValue(controller({
      status: 'result',
      roomImage,
      resultImage,
      presetStyle: '奶油风',
      error: '效果图已生成，但未能保存到历史记录',
    }));

    render(<HomePage />);

    expect(screen.getByRole('alert').textContent).toBe('效果图已生成，但未能保存到历史记录');
    expect(screen.queryByText('已自动保存到历史记录')).toBeNull();
    expect(screen.getByAltText('改造后的房间')).toBeTruthy();
  });

  it('下载失败时保留结果并显示中文提示', async () => {
    const user = userEvent.setup();
    mockedDownloadBlob.mockImplementation(() => {
      throw new Error('download blocked');
    });
    mockedUseGeneration.mockReturnValue(controller({
      status: 'result',
      roomImage,
      resultImage,
      presetStyle: '奶油风',
    }));

    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: '下载效果图' }));

    expect(screen.getByRole('alert').textContent).toContain('下载失败，请再次尝试');
    expect(screen.getByAltText('改造后的房间').getAttribute('src')).toBe('blob:result');
  });
});
