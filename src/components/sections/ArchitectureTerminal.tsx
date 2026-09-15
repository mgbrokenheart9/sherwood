"use client";

import {
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  FileTs,
  FolderOpen,
  Pause,
  Play,
  TerminalWindow,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ActionButton, Segmented } from "@/components/console/controls";
import { AppWindow, Stage } from "@/components/ui/AppWindow";
import { SIMULATED_BUILD_SECONDS, TERMINAL_FILES, TERMINAL_SCRIPT, TERMINAL_STATS, type TerminalLine } from "@/content/terminal";
import { cx } from "@/lib/cn";
import { highlight } from "@/lib/highlight";

type Status = "idle" | "playing" | "paused" | "done";
type Speed = "1" | "2" | "4";

const SPEED_OPTIONS = [
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
  { value: "4", label: "4×" },
] as const;

const SCRIPT_END = TERMINAL_SCRIPT[TERMINAL_SCRIPT.length - 1].at;
const FOLDERS = ["src/core", "src/contexts"] as const;

function simulatedClock(at: number): string {
  const seconds = Math.round((at / SCRIPT_END) * SIMULATED_BUILD_SECONDS);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function Line({ line, caret }: { line: TerminalLine; caret: boolean }) {
  if (line.type === "code") {
    return <pre className="term__code">{highlight(line.text)}</pre>;
  }
  return (
    <div className={`term__line term__line--${line.type}`}>
      <span className="term__time">[{simulatedClock(line.at)}]</span>
      <span>
        {line.type === "command" && <span className="term__prompt">$ </span>}
        {line.text}
        {caret && <span className="term__caret" aria-hidden="true" />}
      </span>
    </div>
  );
}

export function ArchitectureTerminal() {
  const [status, setStatus] = useState<Status>("idle");
  const [count, setCount] = useState(0);
  const [speed, setSpeed] = useState<Speed>("2");
  const screenRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    if (status !== "playing" || count >= TERMINAL_SCRIPT.length) return;
    const previous = count === 0 ? 0 : TERMINAL_SCRIPT[count - 1].at;
    const delay = Math.max(90, (TERMINAL_SCRIPT[count].at - previous) / Number(speed));

    const timer = setTimeout(() => {
      setCount(count + 1);
      if (count + 1 >= TERMINAL_SCRIPT.length) setStatus("done");
    }, delay);
    return () => clearTimeout(timer);
  }, [status, count, speed]);

  useEffect(() => {
    const screen = screenRef.current;
    if (screen && stickToBottom.current) screen.scrollTop = screen.scrollHeight;
  }, [count]);

  const start = () => {
    stickToBottom.current = true;
    setCount(0);
    setStatus("playing");
  };

  const reset = () => {
    setCount(0);
    setStatus("idle");
  };

  const progress = Math.round((count / TERMINAL_SCRIPT.length) * 100);
  const statusText = {
    idle: "Ready",
    playing: `Building architecture… ${progress}%`,
    paused: `Paused · ${progress}%`,
    done: `Build complete · ${TERMINAL_STATS.lines} lines · ${TERMINAL_STATS.components} components · ${TERMINAL_STATS.contexts} context modules`,
  }[status];

  const primary = {
    idle: { label: "Start architecture demo", icon: <Play size={15} weight="fill" />, onClick: start },
    playing: { label: "Pause", icon: <Pause size={15} weight="fill" />, onClick: () => setStatus("paused") },
    paused: { label: "Resume", icon: <Play size={15} weight="fill" />, onClick: () => setStatus("playing") },
    done: { label: "Replay", icon: <ArrowCounterClockwise size={15} weight="bold" />, onClick: start },
  }[status];

  return (
    <Stage>
      <AppWindow title="sherwood · architecture terminal" className="term">
        <div className="app__body">
          <aside className="app__side" aria-label="Generated project">
            <div className="app__brand">
              <BrandMark size={18} />
              <span>sherwood</span>
            </div>

            <div className="app__nav">
              <button type="button" className="app__nav-item" onClick={start}>
                <TerminalWindow size={17} />
                New build
              </button>
              <div className="app__nav-item">
                <span className={cx("dot", status !== "playing" && "dot--off")} aria-hidden="true" />
                Local runtime
                <span className="app__nav-meta">{status === "playing" ? "live" : "idle"}</span>
              </div>
            </div>

            <div>
              <div className="app__group-label">Project</div>
              <div className="tree-item" data-state="done">
                <FolderOpen size={16} />
                zkx8004-framework
              </div>
              {FOLDERS.map((folder) => (
                <div key={folder}>
                  <div className="tree-item tree-item--nested" data-state={count > 8 ? "done" : "pending"}>
                    <FolderOpen size={16} />
                    {folder.replace("src/", "")}
                  </div>
                  {TERMINAL_FILES.filter((file) => file.folder === folder).map((file) => {
                    const state = count > file.done ? "done" : count > file.start ? "current" : "pending";
                    return (
                      <div key={file.name} className="tree-item tree-item--file" data-state={state}>
                        <FileTs size={16} />
                        <span className="break">{file.name}</span>
                        {state === "done" ? (
                          <CheckCircle className="tree-item__check" size={14} weight="fill" />
                        ) : state === "current" ? (
                          <span className="spinner tree-item__check tree-item__spinner" aria-hidden="true" />
                        ) : (
                          <Circle className="tree-item__check" size={12} color="#56655c" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          <div className="app__main">
            {count === 0 && status === "idle" ? (
              <div className="term__empty">
                <BrandMark size={38} />
                <p className="term__empty-title">What should we build on Sherwood?</p>
                <p className="muted" style={{ maxWidth: "46ch" }}>
                  Watch the AI architecture generate the complete ZKx8004 framework in real time: composable contexts,
                  privacy protocols and blockchain integration coming together.
                </p>
              </div>
            ) : (
              <div
                ref={screenRef}
                className="term__screen"
                role="log"
                aria-live="off"
                onScroll={(event) => {
                  const el = event.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }}
              >
                {TERMINAL_SCRIPT.slice(0, count).map((line, index) => (
                  <Line key={index} line={line} caret={status === "playing" && index === count - 1} />
                ))}
              </div>
            )}

            <div className="term__composer">
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="term__composer-row">
                <span className="term__status" role="status">
                  {statusText}
                </span>
              </div>
              <div className="term__composer-row">
                <ActionButton variant={status === "playing" ? "default" : "primary"} icon={primary.icon} onClick={primary.onClick}>
                  {primary.label}
                </ActionButton>
                {count > 0 && (
                  <ActionButton icon={<ArrowCounterClockwise size={15} />} onClick={reset}>
                    Reset
                  </ActionButton>
                )}
                <Segmented label="Playback speed" value={speed} options={SPEED_OPTIONS} onChange={setSpeed} />
                <span className="muted mono" style={{ marginLeft: "auto" }}>
                  Daydreams Architecture Framework v2.1.0
                </span>
              </div>
            </div>
          </div>
        </div>
      </AppWindow>
    </Stage>
  );
}
