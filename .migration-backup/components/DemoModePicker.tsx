"use client";

import { Icon } from "@/components/Icon";
import {
  DEMO_MODE_OPTIONS,
  type DemoMode,
} from "@/lib/chatTypes";

type DemoModePickerProps = {
  mode: DemoMode;
  playing: boolean;
  canReplay: boolean;
  onModeChange: (mode: DemoMode) => void;
  onSkip: () => void;
  onReplay: () => void;
};

export function DemoModePicker({
  mode,
  playing,
  canReplay,
  onModeChange,
  onSkip,
  onReplay,
}: DemoModePickerProps) {
  const showPlaybackControls = mode !== "live" && (playing || canReplay);

  return (
    <div className="demo-mode-picker">
      <div className="demo-mode-picker__header">
        <span className="demo-mode-picker__label t-label-sm">
          <Icon name="bulb" size={16} />
          Demo
        </span>
        <span className="demo-data-badge t-tag-sm">Presenter tool</span>
      </div>

      <div
        className="demo-mode-picker__options"
        role="radiogroup"
        aria-label="Demo scenario"
      >
        {DEMO_MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            title={option.label}
            className={`demo-mode-picker__option t-label-sm${mode === option.id ? " demo-mode-picker__option--active" : ""}`}
            onClick={() => onModeChange(option.id)}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>

      {showPlaybackControls && (
        <div className="demo-mode-picker__playback">
          {playing ? (
            <button
              type="button"
              className="demo-mode-picker__action t-label-sm"
              onClick={onSkip}
            >
              <Icon name="zap" size={14} />
              Skip
            </button>
          ) : (
            <button
              type="button"
              className="demo-mode-picker__action t-label-sm"
              onClick={onReplay}
            >
              <Icon name="arrow-right" size={14} />
              Replay
            </button>
          )}
        </div>
      )}

      {mode !== "live" && (
        <p className="demo-mode-picker__caption t-label-sm text-muted">
          Scripted run — does not change catalogue state.
        </p>
      )}
    </div>
  );
}
