import { useEffect, useState } from 'react';

import { listHistoryRecords, type HistoryRecord } from '../lib/history-db';

interface HistoryPageProps {
  onBack?: () => void;
  onSelectRecord?: (recordId: string) => void;
}

function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  return isToday ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function HistoryThumbnail({ record }: { record: HistoryRecord }) {
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(record.resultImage);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [record.resultImage]);

  return imageUrl ? (
    <img src={imageUrl} alt={`${record.presetStyle || '定制风格'}房间效果图`} />
  ) : null;
}

export function HistoryPage({ onBack = () => {}, onSelectRecord = () => {} }: HistoryPageProps) {
  const [records, setRecords] = useState<HistoryRecord[]>();
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void listHistoryRecords()
      .then((loadedRecords) => {
        if (active) {
          setRecords([...loadedRecords].sort((left, right) => right.createdAt - left.createdAt));
        }
      })
      .catch(() => {
        if (active) {
          setReadFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell history-page">
      <header className="subpage-top">
        <button className="subpage-top__circle" type="button" aria-label="返回首页" onClick={onBack}>‹</button>
        <div className="subpage-brand"><span>栖</span><strong>栖居</strong></div>
        <span className="subpage-top__spacer" aria-hidden="true" />
      </header>

      <section className="history-heading">
        <h1>你的<span>设计记录</span></h1>
        <p>{records ? `共 ${records.length} 个布置方案` : '在本机保存你的每次灵感'}</p>
      </section>

      {readFailed && (
        <section className="history-state">
          <p role="alert">历史记录读取失败，请刷新重试</p>
        </section>
      )}

      {!readFailed && !records && <p className="history-loading" role="status">正在读取历史记录</p>}

      {!readFailed && records?.length === 0 && (
        <section className="history-state">
          <strong>还没有设计记录</strong>
          <p>完成一次房间布置后，方案会自动保存在这里。</p>
          <button className="button button--secondary" type="button" onClick={onBack}>返回首页开始设计</button>
        </section>
      )}

      {!readFailed && records && records.length > 0 && (
        <section className="history-list" aria-label="历史设计记录">
          {records.map((record) => (
            <article className="history-card" key={record.id}>
              <div className="history-card__image"><HistoryThumbnail record={record} /></div>
              <div className="history-card__meta">
                <div>
                  <strong>{record.presetStyle || '参考图定制风格'}</strong>
                  <time dateTime={new Date(record.createdAt).toISOString()}>{formatHistoryTime(record.createdAt)}</time>
                </div>
                <button
                  className="history-card__entry"
                  type="button"
                  aria-label="查看设计详情"
                  onClick={() => onSelectRecord(record.id)}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
