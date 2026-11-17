import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  AlignLeft,
  CheckCircle2,
  AlertCircle,
  Download,
  Minimize2,
  WrapText,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
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

export interface FoldBlock {
  startLine: number;
  endLine: number;
  type: "object" | "array";
  hideEndLine: boolean;
  closeSuffix: string;
}

interface VisibleLine {
  lineIndex: number;
  content: string;
  foldBlock?: FoldBlock;
  isFolded: boolean;
  collapsedLineCount: number;
}

export function computeFoldBlocks(lines: string[]): Map<number, FoldBlock> {
  const blocks = new Map<number, FoldBlock>();
  const stack: { line: number; char: "{" | "[" }[] = [];
  let inString = false;
  let escapeNext = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const ch = line[charIdx];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) {
          escapeNext = true;
          continue;
        }
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }

      if (ch === "/" && line[charIdx + 1] === "/") {
        break;
      }

      if (ch === "{" || ch === "[") {
        stack.push({ line: lineIdx, char: ch });
      } else if (ch === "}" || ch === "]") {
        const expected = ch === "}" ? "{" : "[";
        // Pop until matching opening bracket (gracefully handle malformed extra closers)
        while (stack.length > 0) {
          const top = stack.pop()!;
          if (top.char === expected) {
            if (top.line !== lineIdx) {
              const endLineRaw = line.trim();
              const withoutComment = endLineRaw.replace(/\s*\/\/.*$/, "").trim();
              const isCleanClosingLine = /^[}\],\s]+$/.test(withoutComment);

              // Only treat as hiding endLine when endLine only contains closing brackets/commas
              const hideEndLine = isCleanClosingLine;
              if (hideEndLine || lineIdx - 1 > top.line) {
                const closeChar = top.char === "{" ? "}" : "]";
                const hasComma = withoutComment.endsWith(",");
                const closeSuffix = isCleanClosingLine
                  ? withoutComment
                  : `${closeChar}${hasComma ? "," : ""}`;

                blocks.set(top.line, {
                  startLine: top.line,
                  endLine: lineIdx,
                  type: top.char === "{" ? "object" : "array",
                  hideEndLine,
                  closeSuffix,
                });
              }
            }
            break;
          }
        }
      }
    }
  }

  return blocks;
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
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const [internalWrap, setInternalWrap] = useState(wrap ?? false);
  const [foldedLines, setFoldedLines] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (wrap !== undefined) {
      setInternalWrap(wrap);
    }
  }, [wrap]);

  const lines = useMemo(() => {
    if (!value) return [""];
    return value.split("\n");
  }, [value]);

  const foldBlocks = useMemo(() => {
    if (language !== "json" || !value) {
      return new Map<number, FoldBlock>();
    }
    return computeFoldBlocks(lines);
  }, [lines, language, value]);

  // Clear folded ranges if text changes to something incompatible or empty
  useEffect(() => {
    setFoldedLines((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<number>();
      for (const lineIdx of prev) {
        if (foldBlocks.has(lineIdx)) {
          next.add(lineIdx);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [foldBlocks]);

  const isFoldedActive = language === "json" && foldedLines.size > 0;

  const visibleLines = useMemo<VisibleLine[]>(() => {
    const out: VisibleLine[] = [];
    let i = 0;
    while (i < lines.length) {
      const block = language === "json" ? foldBlocks.get(i) : undefined;
      const isFolded = !!block && foldedLines.has(i);
      if (isFolded && block) {
        const nextIdx = block.hideEndLine ? block.endLine + 1 : block.endLine;
        const collapsedLineCount = Math.max(1, nextIdx - i - 1);
        out.push({
          lineIndex: i,
          content: block.hideEndLine ? lines[i].trimEnd() : lines[i],
          foldBlock: block,
          isFolded: true,
          collapsedLineCount,
        });
        i = Math.max(i + 1, nextIdx);
      } else {
        out.push({
          lineIndex: i,
          content: lines[i],
          foldBlock: block,
          isFolded: false,
          collapsedLineCount: 0,
        });
        i++;
      }
    }
    return out;
  }, [lines, foldBlocks, foldedLines, language]);

  const isWrapped = wrap !== undefined ? wrap : internalWrap;

  const handleToggleWrap = () => {
    const next = !isWrapped;
    setInternalWrap(next);
    onWrapChange?.(next);
  };

  const toggleFold = useCallback((lineIdx: number) => {
    setFoldedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) {
        next.delete(lineIdx);
      } else {
        next.add(lineIdx);
      }
      return next;
    });
  }, []);

  const handleCollapseAll = useCallback(() => {
    if (foldBlocks.size === 0) return;
    setFoldedLines(new Set(foldBlocks.keys()));
  }, [foldBlocks]);

  const handleExpandAll = useCallback(() => {
    setFoldedLines(new Set());
  }, []);

  const handleUnfoldAndFocus = useCallback(() => {
    setFoldedLines(new Set());
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const linesCount = lines.length;

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
      setFoldedLines(new Set());
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // If it contains unquoted {{VAR}}, keep as-is
    }
  };

  const handleMinify = () => {
    if (!value.trim() || !onChange) return;
    try {
      const parsed = JSON.parse(value);
      setFoldedLines(new Set());
      onChange(JSON.stringify(parsed));
    } catch {
      // ignore
    }
  };

  const handleTextareaScroll = () => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (preRef.current) {
        preRef.current.scrollTop = scrollTop;
        preRef.current.scrollLeft = scrollLeft;
      }
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
    }
  };

  const handlePreScroll = () => {
    if (preRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = preRef.current.scrollTop;
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

  const canFold = language === "json" && foldBlocks.size > 0;
  const textareaVisible = !readOnly && !isFoldedActive;

  useEffect(() => {
    if (textareaVisible && textareaRef.current && preRef.current) {
      textareaRef.current.scrollTop = preRef.current.scrollTop;
      textareaRef.current.scrollLeft = preRef.current.scrollLeft;
    }
  }, [textareaVisible]);

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
            {!readOnly && isFoldedActive && (
              <button
                type="button"
                className="btn-ghost btn-xxs json-unfold-edit-pill"
                onClick={handleUnfoldAndFocus}
                title="Expand all collapsed blocks to continue editing"
              >
                <Pencil size={11} />
                <span>Unfold to Edit</span>
              </button>
            )}
          </div>

          <div className="code-actions">
            {canFold && (
              <>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={handleCollapseAll}
                  disabled={foldedLines.size === foldBlocks.size}
                  title="Collapse all JSON objects and arrays"
                >
                  <ChevronsDownUp size={12} />
                  <span>Collapse All</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={handleExpandAll}
                  disabled={foldedLines.size === 0}
                  title="Expand all collapsed JSON blocks"
                >
                  <ChevronsUpDown size={12} />
                  <span>Expand All</span>
                </button>
              </>
            )}

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
        <div
          ref={gutterRef}
          className={`code-gutter ${canFold ? "with-folding" : ""}`}
          aria-hidden="true"
        >
          {visibleLines.map((vis) => (
            <div key={vis.lineIndex} className="code-gutter-line">
              <span className="code-line-num">{vis.lineIndex + 1}</span>
              {canFold &&
                (vis.foldBlock ? (
                  <button
                    type="button"
                    className={`gutter-fold-btn ${vis.isFolded ? "is-folded" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFold(vis.lineIndex);
                    }}
                    title={
                      vis.isFolded
                        ? `Expand (${vis.collapsedLineCount} ${
                            vis.collapsedLineCount === 1 ? "line" : "lines"
                          })`
                        : "Collapse block"
                    }
                  >
                    {vis.isFolded ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </button>
                ) : (
                  <span className="gutter-fold-spacer" />
                ))}
            </div>
          ))}
        </div>

        <div className="code-stage">
          <pre
            ref={preRef}
            className="code-highlight-layer"
            aria-hidden={textareaVisible}
            onScroll={handlePreScroll}
            onDoubleClick={
              !readOnly && isFoldedActive ? handleUnfoldAndFocus : undefined
            }
          >
            <code>
              {language === "json"
                ? value
                  ? visibleLines.map((vis, idx) => (
                      <React.Fragment key={vis.lineIndex}>
                        <span className="code-line-row">
                          {highlightJsonTokens(vis.content)}
                          {vis.isFolded && vis.foldBlock && (
                            <>
                              <button
                                type="button"
                                className="json-fold-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFold(vis.lineIndex);
                                }}
                                title={`Click to expand (${vis.collapsedLineCount} hidden ${
                                  vis.collapsedLineCount === 1 ? "line" : "lines"
                                })`}
                              >
                                ...
                              </button>
                              {vis.foldBlock.hideEndLine && (
                                <span className="json-fold-close">
                                  {vis.foldBlock.closeSuffix}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        {idx < visibleLines.length - 1 ? "\n" : null}
                      </React.Fragment>
                    ))
                  : readOnly
                    ? ""
                    : " "
                : value || (readOnly ? "" : " ")}
            </code>
          </pre>
          {textareaVisible && (
            <textarea
              ref={textareaRef}
              className="code-textarea-layer"
              value={value}
              placeholder={placeholder}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => onChange?.(e.target.value)}
              onScroll={handleTextareaScroll}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
      </div>
    </div>
  );
};
