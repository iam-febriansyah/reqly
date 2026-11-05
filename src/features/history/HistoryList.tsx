import React from "react";
import { Clock, Trash2, RotateCcw } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { MethodBadge } from "../../components/MethodBadge";

export const HistoryList: React.FC = () => {
  const {
    history,
    reopenHistoryEntry,
    clearProjectHistory,
    deleteHistoryEntry,
  } = useAppStore();

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getStatusClass = (code: number | null) => {
    if (!code) return "status-err";
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 400 && code < 500) return "status-4xx";
    return "status-5xx";
  };

  return (
    <div className="history-panel">
      <div className="sidebar-section-header">
        <span className="section-caption">
          Recent Requests ({history.length})
        </span>
        {history.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-xxs"
            onClick={clearProjectHistory}
            title="Clear all project history"
          >
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="sidebar-empty-state">
          <Clock size={22} className="muted-icon" />
          <p>No requests sent yet.</p>
          <span>Sent requests appear here with status and latency.</span>
        </div>
      ) : (
        <div className="history-items-scroll">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="history-item"
              onClick={() => reopenHistoryEntry(entry)}
              title="Click to reopen this request"
            >
              <div className="history-item-top">
                <MethodBadge method={entry.method} size="sm" />
                <span className="history-url">{entry.url}</span>
                <button
                  type="button"
                  className="icon-btn history-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteHistoryEntry(entry.id);
                  }}
                  title="Remove history entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="history-item-meta">
                <span className={`status-micro-pill ${getStatusClass(entry.statusCode)}`}>
                  {entry.statusCode ? `${entry.statusCode}` : "ERR"}
                </span>
                <span className="meta-num">{entry.durationMs} ms</span>
                <span className="meta-time">{formatTime(entry.timestamp)}</span>
                <span className="history-reopen-hint">
                  <RotateCcw size={10} /> Reopen
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

