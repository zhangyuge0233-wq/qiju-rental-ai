import { useEffect, useRef, useState } from 'react';

import { ImageProcessingError, compressImage, validateImage } from '../lib/images';

interface ImagePickerProps {
  label: string;
  required: boolean;
  value?: Blob;
  defaultImageSrc?: string;
  onChange: (blob: Blob) => void;
  onError: (message: string) => void;
}

export function ImagePicker({
  label,
  required,
  value,
  defaultImageSrc,
  onChange,
  onError,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionSequence = useRef(0);
  const [valueUrl, setValueUrl] = useState<string>();

  useEffect(() => {
    if (!value) {
      setValueUrl(undefined);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(value);
    setValueUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [value]);

  const chooseImage = () => inputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const currentSelection = ++selectionSequence.current;
    const file = event.currentTarget.files?.item(0);
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    const validation = validateImage(file);
    if (!validation.ok) {
      onError(validation.message);
      return;
    }

    try {
      const compressedImage = await compressImage(file);
      if (currentSelection === selectionSequence.current) {
        onChange(compressedImage);
      }
    } catch (error) {
      if (currentSelection === selectionSequence.current) {
        onError(
          error instanceof ImageProcessingError ? error.message : '图片处理失败，请更换后重试',
        );
      }
    }
  };

  return (
    <section aria-label={label}>
      <div>
        <span>{label}</span>
        <span>{required ? '必填' : '选填'}</span>
      </div>

      {valueUrl ? (
        <img src={valueUrl} alt={`已选择的${label}`} />
      ) : defaultImageSrc ? (
        <figure>
          <img src={defaultImageSrc} alt={`默认${label}示例`} />
          <figcaption>{`示例图，请上传${label}`}</figcaption>
        </figure>
      ) : (
        <p>暂未选择图片</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`${label}图片选择`}
        onChange={handleFileChange}
        hidden
      />
      <button type="button" onClick={chooseImage}>
        选择图片
      </button>
    </section>
  );
}
