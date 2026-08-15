import { useCallback, useEffect, useState } from 'react';

import { CompareSlider } from '../components/CompareSlider';
import { DeleteDialog } from '../components/DeleteDialog';
import { deleteHistoryRecord, getHistoryRecord, type HistoryRecord } from '../lib/history-db';
import { downloadBlob } from '../lib/images';

interface HistoryDetailPageProps {
  recordId: string;
  onBack?: () => void;
  onRegenerate?: (record: HistoryRecord) => void;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}

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

function formatDetailTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  return isToday ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function HistoryDetailPage({
  recordId,
  onBack = () => {},
  onRegenerate = () => {},
}: HistoryDetailPageProps) {
  const [record, setRecord] = useState<HistoryRecord>();
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();
  const roomUrl = useObjectUrl(record?.roomImage);
  const resultUrl = useObjectUrl(record?.resultImage);

  useEffect(() => {
    let active = true;
    setRecord(undefined);
    setLoaded(false);
    setReadFailed(false);
    void getHistoryRecord(recordId)
      .then((loadedRecord) => {
        if (active) {
          setRecord(loadedRecord);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setReadFailed(true);
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [recordId]);

  const closeDeleteDialog = useCallback(() => {
    if (!deleting) {
      setDeleteOpen(false);
      setDeleteError(undefined);
    }
  }, [deleting]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteHistoryRecord(recordId);
      onBack();
    } catch {
      setDeleteError('删除失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!record) {
      return;
    }

    try {
      downloadBlob(record.resultImage, `栖居-${record.presetStyle || '定制风格'}-效果图.webp`);
      setDownloadError(undefined);
    } catch {
      setDownloadError('下载失败，请再次尝试');
    }
  };

  if (!loaded) {
    return <main className="app-shell detail-page"><p className="history-loading" role="status">正在读取设计记录</p></main>;
  }

  if (readFailed || !record) {
    return (
      <main className="app-shell detail-page">
        <header className="subpage-top">
          <button className="subpage-top__circle" type="button" aria-label="返回历史列表" onClick={onBack}>‹</button>
          <div className="subpage-brand"><span>栖</span><strong>栖居</strong></div>
          <span className="subpage-top__spacer" aria-hidden="true" />
        </header>
        <section className="history-state">
          {readFailed
            ? <p role="alert">历史记录读取失败，请返回重试</p>
            : <strong>未找到这条历史记录</strong>}
          <button className="button button--secondary" type="button" onClick={onBack}>返回历史列表</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell detail-page">
      <header className="subpage-top detail-page__top">
        <button className="subpage-top__circle" type="button" aria-label="返回历史列表" onClick={onBack}>‹</button>
        <div className="subpage-brand"><span>栖</span><strong>栖居</strong></div>
        <button
          className="subpage-top__circle detail-page__delete"
          type="button"
          aria-label="删除这条记录"
          onClick={() => {
            setDeleteError(undefined);
            setDeleteOpen(true);
          }}
        >
          <TrashIcon />
        </button>
      </header>

      <section className="detail-heading">
        <h1>{record.presetStyle || '定制风格'}<span>布置方案</span></h1>
        <p>{formatDetailTime(record.createdAt)} · 已保留原有硬装结构</p>
      </section>

      {roomUrl && resultUrl && <CompareSlider before={roomUrl} after={resultUrl} />}
      {downloadError && <p className="inline-alert detail-page__alert" role="alert">{downloadError}</p>}

      <div className="result-actions detail-actions" role="group" aria-label="历史方案操作">
        <button className="button button--secondary" type="button" onClick={() => onRegenerate(record)}>
          用此方案再生成
        </button>
        <button className="button button--primary" type="button" onClick={handleDownload}>
          下载效果图
        </button>
      </div>

      <DeleteDialog
        open={deleteOpen}
        deleting={deleting}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onConfirm={() => void confirmDelete()}
      />
    </main>
  );
}
