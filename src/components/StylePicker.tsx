const styles = ['奶油风', '原木风', '北欧风', '复古风', '极简风', '多巴胺风'];

interface StylePickerProps {
  value?: string;
  onChange: (value?: string) => void;
}

export function StylePicker({ value, onChange }: StylePickerProps) {
  return (
    <section className="form-section" aria-labelledby="style-picker-label">
      <div className="section-label" id="style-picker-label">
        <span>选择风格</span>
        <span className="field-badge">选填</span>
      </div>
      <div className="style-picker" role="group" aria-label="预设设计风格">
        {styles.map((style) => {
          const selected = style === value;

          return (
            <button
              className="style-option"
              type="button"
              aria-pressed={selected}
              key={style}
              onClick={() => onChange(selected ? undefined : style)}
            >
              {style}
            </button>
          );
        })}
      </div>
    </section>
  );
}
