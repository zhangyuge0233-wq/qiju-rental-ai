import { useState } from 'react';

interface CompareSliderProps {
  before: string;
  after: string;
}

export function CompareSlider({ before, after }: CompareSliderProps) {
  const [position, setPosition] = useState(50);
  const updatePosition = (nextPosition: number) => {
    setPosition(Math.max(0, Math.min(100, nextPosition)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const keyPositions: Partial<Record<string, number>> = {
      ArrowLeft: position - 1,
      ArrowDown: position - 1,
      ArrowRight: position + 1,
      ArrowUp: position + 1,
      Home: 0,
      End: 100,
    };
    const nextPosition = keyPositions[event.key];

    if (nextPosition !== undefined) {
      event.preventDefault();
      updatePosition(nextPosition);
    }
  };

  return (
    <div className="compare" aria-label="改造前后滑动对比">
      <img className="compare__after" src={after} alt="改造后的房间" />
      <div
        className="compare__before"
        data-testid="before-layer"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={before} alt="改造前的房间" />
      </div>
      <span className="compare__label compare__label--before">原图</span>
      <span className="compare__label compare__label--after">效果图</span>
      <div
        className="compare__divider"
        data-testid="compare-divider"
        style={{ left: `${position}%` }}
        aria-hidden="true"
      >
        <span className="compare__handle">↔</span>
      </div>
      <input
        className="compare__range"
        type="range"
        min="0"
        max="100"
        step="1"
        value={position}
        aria-label="拖动查看改造前后"
        aria-valuetext={`显示 ${position}% 原图`}
        onChange={(event) => updatePosition(Number(event.currentTarget.value))}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
