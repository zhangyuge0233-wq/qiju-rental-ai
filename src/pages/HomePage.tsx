import { useEffect, useState } from 'react';

import { CompareSlider } from '../components/CompareSlider';
import { ImagePicker } from '../components/ImagePicker';
import { StylePicker } from '../components/StylePicker';
import { useGeneration, type GenerationController } from '../hooks/use-generation';
import { downloadBlob } from '../lib/images';

function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return undefined;
    }

    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function Brand() {
  return (
    <header className="brand-bar">
      <div className="brand">
        <span className="brand__logo" aria-hidden="true">栖</span>
        <span>栖居</span>
      </div>
      <span className="brand-bar__tag">AI 房间设计</span>
    </header>
  );
}

interface HomePageProps {
  generationController?: GenerationController;
  onOpenHistory?: () => void;
}

interface HomePageContentProps {
  generation: GenerationController;
  onOpenHistory: () => void;
}

function HomePageContent({ generation, onOpenHistory }: HomePageContentProps) {
  const [downloadError, setDownloadError] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const roomUrl = useObjectUrl(generation.status === 'generating' || generation.status === 'result'
    ? generation.roomImage
    : undefined);
  const resultUrl = useObjectUrl(generation.status === 'result' ? generation.resultImage : undefined);
  const hasDirection = Boolean(generation.presetStyle || generation.referenceImage);
  const canGenerate = Boolean(generation.roomImage && hasDirection);
  const hasCombinedDirection = Boolean(generation.presetStyle && generation.referenceImage);

  const handleDownload = () => {
    if (!generation.resultImage) {
      return;
    }

    try {
      downloadBlob(generation.resultImage, '栖居-房间布置效果.webp');
      setDownloadError(undefined);
    } catch {
      setDownloadError('下载失败，请再次尝试');
    }
  };

  const handleRegenerate = () => {
    generation.resetToEditing();
    void generation.generate();
  };

  if (generation.status === 'generating') {
    return (
      <main className="app-shell app-shell--focus">
        <Brand />
        <section className="state-heading">
          <h1>正在重新布置你的房间</h1>
          <p>保留原有硬装，只调整家具与软装。</p>
        </section>
        <div className="generation-preview">
          {roomUrl && <img src={roomUrl} alt="正在处理的房间照片" />}
          <span className="scan-light" aria-hidden="true" />
          <div className="generation-card" role="status" aria-live="polite">
            <div className="generation-card__status">
              <span className="spinner" aria-hidden="true" />
              <span>正在生成布置效果</span>
            </div>
            <p>请保持页面开启，完成后会自动展示结果</p>
          </div>
        </div>
        <div className="calm-note"><i aria-hidden="true" />完成后会自动展示并保存结果</div>
        <button className="button button--disabled" type="button" disabled>
          正在生成，请稍候
        </button>
      </main>
    );
  }

  if (generation.status === 'result' && roomUrl && resultUrl) {
    const resultMeta = hasCombinedDirection
      ? `${generation.presetStyle} · 参考图优先色彩、材质与氛围`
      : generation.presetStyle || '参考图定制风格';

    return (
      <main className="app-shell app-shell--focus">
        <Brand />
        <section className="state-heading state-heading--result">
          <h1>你的房间<span>焕新完成</span></h1>
          <p>{resultMeta} · 已保留原有墙面、门窗与地板</p>
        </section>
        <CompareSlider before={roomUrl} after={resultUrl} />
        {!generation.error && (
          <div className="calm-note"><i aria-hidden="true" />已自动保存到历史记录</div>
        )}
        {generation.error && <p className="inline-alert" role="alert">{generation.error}</p>}
        {downloadError && <p className="inline-alert" role="alert">{downloadError}</p>}
        <div className="result-actions" role="group" aria-label="效果图操作">
          <button className="button button--secondary" type="button" onClick={handleRegenerate}>
            再次生成
          </button>
          <button className="button button--primary" type="button" onClick={handleDownload}>
            下载效果图
          </button>
        </div>
        <button
          className="adjust-button"
          type="button"
          onClick={generation.resetToEditing}
        >
          重新调整照片或风格
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Brand />
      <section className="hero">
        <h1>让房间<span>更像你</span></h1>
        <p>一张照片，看看你的出租屋还能有多好看。</p>
        <span className="hero__spark" aria-hidden="true">✦</span>
      </section>

      <div className="room-picker">
        <ImagePicker
          label="房间照片"
          required
          value={generation.roomImage}
          defaultImageSrc="/assets/default-room.webp"
          onChange={(image) => {
            setImageError(undefined);
            generation.setRoomImage(image);
          }}
          onError={setImageError}
        />
      </div>

      <StylePicker value={generation.presetStyle} onChange={generation.setPresetStyle} />

      <div className="reference-picker">
        <ImagePicker
          label="风格参考图"
          required={false}
          value={generation.referenceImage}
          onChange={(image) => {
            setImageError(undefined);
            generation.setReferenceImage(image);
          }}
          onError={setImageError}
        />
      </div>

      {hasCombinedDirection && (
        <p className="direction-note">参考图将优先影响色彩、材质与氛围</p>
      )}
      {(imageError || generation.error) && (
        <p className="inline-alert" role="alert">{imageError || generation.error}</p>
      )}

      <button
        className="button button--primary generate-button"
        type="button"
        disabled={!canGenerate}
        onClick={() => void generation.generate()}
      >
        生成我的房间
      </button>
      <button className="history-link" type="button" onClick={onOpenHistory}>
        查看历史记录
      </button>
    </main>
  );
}

function HomePageWithController({ onOpenHistory }: Pick<HomePageContentProps, 'onOpenHistory'>) {
  const generation = useGeneration();
  return <HomePageContent generation={generation} onOpenHistory={onOpenHistory} />;
}

export function HomePage({
  generationController,
  onOpenHistory = () => {},
}: HomePageProps = {}) {
  if (generationController) {
    return <HomePageContent generation={generationController} onOpenHistory={onOpenHistory} />;
  }

  return <HomePageWithController onOpenHistory={onOpenHistory} />;
}
