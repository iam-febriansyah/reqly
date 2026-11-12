import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  AlignLeft,
  CheckCircle2,
  AlertCircle,
  Download,
  Minimize2,
  WrapText,
} from "lucide-react";

interface JsonCodeEditorProps {
  value: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  language?: "json" | "raw" | "html";
  placeholder?: string;
  maxHeight?: string;
  wrap?: boolean;
  onWrapChange?: (wrapped: boolean) => void;
  hideToolbar?: boolean;
  onSaveFile?: () => void;
  saveButtonTitle?: string;
}

export function highlightJsonTokens(code: string): React.ReactNode[] {
  if (!code) return [];
  const tokenRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\{\{[^{}]+\}\})/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }
    const token = match[0];
    let cls = "tok-number";
    if (token.startsWith("{{") && token.endsWith("}}")) {
      cls = "tok-variable";
    } else if (token.startsWith('"')) {
      if (token.endsWith(":")) {
        cls = "tok-key";
      } else {
        cls = "tok-string";
      }
    } else if (token === "true" || token === "false") {
      cls = "tok-boolean";
    } else if (token === "null") {
      cls = "tok-null";
    }
    nodes.push(
      <span key={keyCounter++} className={cls}>
        {token}
      </span>
    );
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }
  return nodes;
}

export const JsonCodeEditor: React.FC<JsonCodeEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  language = "json",
  placeholder = '{\n  "key": "value"\n}',
  wrap,
  onWrapChange,
  hideToolbar = false,
  onSaveFile,
  saveButtonTitle = "Save as JSON file",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const [internalWrap, setInternalWrap] = useState(wrap ?? false);

  useEffect(() => {
    if (wrap !== undefined) {
      setInternalWrap(wrap);
    }
  }, [wrap]);

  const isWrapped = wrap !== undefined ? wrap : internalWrap;

  const handleToggleWrap = () => {
    const next = !isWrapped;
    setInternalWrap(next);
    onWrapChange?.(next);
  };

  const linesCount = useMemo(() => {
    if (!value) return 1;
    return value.split("\n").length;
  }, [value]);

  const jsonValidation = useMemo(() => {
    if (language !== "json" || !value.trim()) {
      return { valid: true, error: null };
    }
    // Temporarily replace {{VAR}} with a valid string token for syntax checking
    const sanitized = value.replace(/\{\{[^{}]+\}\}/g, '"__var__"');
    try {
      JSON.parse(sanitized);
      return { valid: true, error: null };
    } catch (e: any) {
      return { valid: false, error: e?.message || "Invalid JSON" };
    }
  }, [value, language]);

  const handleFormat = () => {
    if (!value.trim() || !onChange) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // If it contains unquoted {{VAR}}, keep as-is
    }
  };

  const handleMinify = () => {
    if (!value.trim() || !onChange) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed));
    } catch {
      // ignore
    }
  };

  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || !onChange) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.substring(0, start) + "  " + value.substring(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    } else if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      e.key.toLowerCase() === "f"
    ) {
      e.preventDefault();
      handleFormat();
    }
  };

  return (
    <div
      className={`code-editor-container ${
        isWrapped ? "is-wrapped" : "no-wrap"
      }`}
    >
      {!hideToolbar && (
        <div className="code-editor-toolbar">
          <div className="code-status">
            {language === "json" && !readOnly && (
              jsonValidation.valid ? (
                <span className="json-valid-pill">
                  <CheckCircle2 size={12} />
                  <span>Valid JSON</span>
                </span>
              ) : (
                <span
                  className="json-invalid-pill"
                  title={jsonValidation.error || ""}
                >
                  <AlertCircle size={12} />
                  <span>Syntax Warning</span>
                </span>
              )
            )}
            <span className="code-meta-pill" title={`${linesCount} lines`}>
              {linesCount} {linesCount === 1 ? "line" : "lines"}
            </span>
          </div>

          <div className="code-actions">
            {language === "json" && !readOnly && (
              <>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={handleFormat}
                  title="Beautify JSON (Ctrl+Shift+F)"
                >
                  <AlignLeft size={12} />
                  <span>Prettify</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={handleMinify}
                  title="Minify JSON"
                >
                  <Minimize2 size={12} />
                  <span>Minify</span>
                </button>
              </>
            )}

            <button
              type="button"
              className={`btn-ghost btn-xs code-wrap-btn ${
                isWrapped ? "active" : ""
              }`}
              onClick={handleToggleWrap}
              title={
                isWrapped
                  ? "Disable line wrapping (scroll horizontally)"
                  : "Enable line wrapping (soft wrap)"
              }
            >
              <WrapText size={12} />
              <span>{isWrapped ? "Wrap: On" : "Wrap: Off"}</span>
            </button>

            {onSaveFile && (
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={onSaveFile}
                title={saveButtonTitle}
              >
                <Download size={12} />
                <span>Save JSON</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="code-editor-body">
        <div className="code-gutter" aria-hidden="true">
          {Array.from({ length: Math.max(1, linesCount) }).map((_, i) => (
            <div key={i} className="code-line-num">
              {i + 1}
            </div>
          ))}
        </div>

        <div className="code-stage">
          <pre
            ref={preRef}
            className="code-highlight-layer"
            aria-hidden={!readOnly}
          >
            <code>
              {language === "json"
                ? highlightJsonTokens(value)
                : value || (readOnly ? "" : " ")}
            </code>
          </pre>
          {!readOnly && (
            <textarea
              ref={textareaRef}
              className="code-textarea-layer"
              value={value}
              placeholder={placeholder}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => onChange?.(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
      </div>
    </div>
  );
};
