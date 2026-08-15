/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompareSlider } from '../../src/components/CompareSlider';

afterEach(cleanup);

describe('CompareSlider', () => {
  it('滑杆改变原图裁切比例', () => {
    render(<CompareSlider before="blob:before" after="blob:after" />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });

    expect(screen.getByTestId('before-layer').style.clipPath).toBe('inset(0 30% 0 0)');
    expect(screen.getByTestId('compare-divider').style.left).toBe('70%');
  });

  it('方向键可精确调整对比位置', () => {
    render(<CompareSlider before="blob:before" after="blob:after" />);
    const slider = screen.getByRole('slider');

    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect((slider as HTMLInputElement).value).toBe('51');
    expect(screen.getByTestId('before-layer').style.clipPath).toBe('inset(0 49% 0 0)');
  });

  it('提供中文图片替代文本和滑杆名称', () => {
    render(<CompareSlider before="blob:before" after="blob:after" />);

    expect(screen.getByAltText('改造前的房间')).toBeTruthy();
    expect(screen.getByAltText('改造后的房间')).toBeTruthy();
    expect(screen.getByRole('slider', { name: '拖动查看改造前后' })).toBeTruthy();
  });
});
