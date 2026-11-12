import React, { useEffect, useRef, useState } from "react";
import {
  Command,
  Layers,
  Monitor,
  Moon,
  Plus,
  Share2,
  Sun,
  Zap,
} from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import { ProjectExplorer } from "../features/projects/ProjectExplorer";
import { RequestEditor } from "../features/requests/RequestEditor";
import { ResponseViewer } from "../features/response/ResponseViewer";
import { EnvironmentManagerModal } from "../features/environments/EnvironmentManagerModal";
import { PostmanModal } from "../features/projects/PostmanModal";
import type { ThemeMode } from "../types";

export const MainLayout: React.FC = () => {
  const {
    activeProject,
    activeEnvironment,
    themeMode,
    setThemeMode,
    setEnvModalOpen,
    setImportExportModalOpen,
    createRequest,
    sendActiveRequest,
    toastMessage,
  } = useAppStore();

  const [sidebarWidth, setSidebarWidth] = useState<number>(272);
  const [responseWidthPercent, setResponseWidthPercent] = useState<number>(43);
  const [draggingResizer, setDraggingResizer] = useState<
    "sidebar" | "response" | null
  >(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceSplitRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const grabOffsetRef = useRef<number>(0);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        sendActiveRequest();
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        createRequest(null, "New Request");
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setEnvModalOpen(true);
      } else if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setImportExportModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    sendActiveRequest,
    createRequest,
    setEnvModalOpen,
    setImportExportModalOpen,
  ]);

  // 1:1 Direct Manipulation Resizer for Left Sidebar (Apple Design Principle #2)
  const handleSidebarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    grabOffsetRef.current = e.clientX - sidebarWidth;
    setDraggingResizer("sidebar");
  };

  const handleSidebarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingResizer !== "sidebar") return;
    const rawWidth = e.clientX - grabOffsetRef.current;
    // Rubber-band feel at boundaries (210px to 440px)
    const clamped = Math.max(210, Math.min(440, rawWidth));
    setSidebarWidth(clamped);
  };

  const handleSidebarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingResizer === "sidebar") {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDraggingResizer(null);
    }
  };

  // 1:1 Direct Manipulation Resizer for Request / Response Split
  const handleResponsePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingResizer("response");
  };

  const handleResponsePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingResizer !== "response" || !workspaceSplitRef.current) return;
    const rect = workspaceSplitRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const responsePx = rect.width - relX;
    const pct = (responsePx / rect.width) * 100;
    setResponseWidthPercent(Math.max(26, Math.min(66, pct)));
  };

  const handleResponsePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingResizer === "response") {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDraggingResizer(null);
    }
  };

  const cycleTheme = (next: ThemeMode) => {
    setThemeMode(next);
  };

  return (
    <div className="app-shell" ref={mainContainerRef}>
      {/* Top Translucent Native Utility Toolbar */}
      <header className="top-chrome-bar">
        <div className="brand-cluster">
          <div className="brand-logo" aria-hidden="true">
            <svg
              viewBox="0 0 256 256"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M 48 40 L 144 40 A 52 52 0 0 1 196 92 A 52 52 0 0 1 144 144 L 136 144 L 208 216 L 156 216 L 84 144 L 84 216 L 48 216 Z M 84 74 L 84 110 L 142 110 A 18 18 0 0 0 160 92 A 18 18 0 0 0 142 74 Z"
              />
              <path d="M 172 40 L 208 40 L 208 76 Z" />
            </svg>
          </div>
          <span className="brand-name">Reqly</span>
          <span className="brand-tag">REST Client</span>
        </div>

        <div className="chrome-center-status">
          {activeProject && (
            <div className="chrome-context-pill">
              <span className="context-project">{activeProject.name}</span>
              <span className="context-sep">/</span>
              <button
                type="button"
                className="context-env-btn"
                onClick={() => setEnvModalOpen(true)}
                title="Click to manage environment variables (Ctrl+E)"
              >
                <Layers size={11} />
                <span>
                  {activeEnvironment ? activeEnvironment.name : "No Environment"}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="chrome-right-controls">
          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => createRequest(null, "New Request")}
            title="New Request (Ctrl+N)"
          >
            <Plus size={13} />
            <span>New</span>
          </button>

          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => setEnvModalOpen(true)}
            title="Environment Variables (Ctrl+E)"
          >
            <Layers size={13} />
            <span>Environments</span>
          </button>

          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => setImportExportModalOpen(true)}
            title="Import / Export Postman Collection v2.1 (Ctrl+I)"
          >
            <Share2 size={13} />
            <span>Postman v2.1</span>
          </button>

          <div className="shortcut-popover-anchor">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShortcutsOpen((v) => !v)}
              title="Keyboard Shortcuts"
            >
              <Command size={14} />
            </button>

            {shortcutsOpen && (
              <div
                className="shortcuts-popover"
                onPointerLeave={() => setShortcutsOpen(false)}
              >
                <div className="shortcuts-title">Keyboard Shortcuts</div>
                <div className="shortcut-row">
                  <span>Send Request</span>
                  <kbd>Ctrl + Enter</kbd>
                </div>
                <div className="shortcut-row">
                  <span>New Request</span>
                  <kbd>Ctrl + N</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Search Requests</span>
                  <kbd>Ctrl + K</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Environments</span>
                  <kbd>Ctrl + E</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Postman Import/Export</span>
                  <kbd>Ctrl + I</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Prettify JSON</span>
                  <kbd>Ctrl + Shift + F</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Save Request As</span>
                  <kbd>Ctrl + Shift + S</kbd>
                </div>
              </div>
            )}
          </div>

          <div
            className="theme-segmented"
            role="group"
            aria-label="Appearance preference"
          >
            <button
              type="button"
              className={`theme-btn ${themeMode === "light" ? "active" : ""}`}
              onClick={() => cycleTheme("light")}
              title="Light Mode"
            >
              <Sun size={12} />
            </button>
            <button
              type="button"
              className={`theme-btn ${themeMode === "dark" ? "active" : ""}`}
              onClick={() => cycleTheme("dark")}
              title="Dark Mode"
            >
              <Moon size={12} />
            </button>
            <button
              type="button"
              className={`theme-btn ${themeMode === "system" ? "active" : ""}`}
              onClick={() => cycleTheme("system")}
              title="System Appearance"
            >
              <Monitor size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Three-Section Resizable Desktop Workspace */}
      <div className="three-pane-body">
        <div
          className="sidebar-wrapper"
          style={{ width: sidebarWidth, minWidth: sidebarWidth }}
        >
          <ProjectExplorer searchInputRef={searchInputRef} />
        </div>

        <div
          className={`pane-resizer ${
            draggingResizer === "sidebar" ? "active" : ""
          }`}
          onPointerDown={handleSidebarPointerDown}
          onPointerMove={handleSidebarPointerMove}
          onPointerUp={handleSidebarPointerUp}
          title="Drag to resize project explorer"
        />

        <div className="workspace-split-area" ref={workspaceSplitRef}>
          <div
            className="editor-pane-holder"
            style={{ width: `${100 - responseWidthPercent}%` }}
          >
            <RequestEditor />
          </div>

          <div
            className={`pane-resizer ${
              draggingResizer === "response" ? "active" : ""
            }`}
            onPointerDown={handleResponsePointerDown}
            onPointerMove={handleResponsePointerMove}
            onPointerUp={handleResponsePointerUp}
            title="Drag to resize response panel"
          />

          <div
            className="response-pane-holder"
            style={{ width: `${responseWidthPercent}%` }}
          >
            <ResponseViewer />
          </div>
        </div>
      </div>

      {/* Modals & Toasts */}
      <EnvironmentManagerModal />
      <PostmanModal />

      {toastMessage && (
        <div className="apple-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
