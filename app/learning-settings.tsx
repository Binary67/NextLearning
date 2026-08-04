"use client";

import { Settings, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import type { ExplanationStyle } from "@/lib/use-realtime-tutor";

const DEFAULT_RAISE_HAND_SHORTCUT = " ";
const DEFAULT_EXPLANATION_STYLE: ExplanationStyle = "technical";
const RAISE_HAND_SHORTCUT_STORAGE_KEY =
  "nextlearning.raise-hand-shortcut";
const EXPLANATION_STYLE_STORAGE_KEY =
  "nextlearning.explanation-style";
const AUDIO_INPUT_STORAGE_KEY = "nextlearning.audio-input-device";
const AUDIO_OUTPUT_STORAGE_KEY = "nextlearning.audio-output-device";
const LOCAL_SETTINGS_EVENT = "nextlearning-settings-change";
const RESERVED_SHORTCUT_KEYS = new Set(["e", "t"]);

type SelectAudioDevice = (deviceId: string) => Promise<boolean>;

export function useLearningSettings() {
  const raiseHandShortcut = useLocalSetting(
    RAISE_HAND_SHORTCUT_STORAGE_KEY,
    DEFAULT_RAISE_HAND_SHORTCUT,
  );
  const explanationStyle = useLocalSetting(
    EXPLANATION_STYLE_STORAGE_KEY,
    DEFAULT_EXPLANATION_STYLE,
  ) as ExplanationStyle;

  return {
    raiseHandShortcut,
    raiseHandShortcutLabel: formatShortcut(raiseHandShortcut),
    explanationStyle,
    audioInputDeviceId: useLocalSetting(AUDIO_INPUT_STORAGE_KEY, ""),
    audioOutputDeviceId: useLocalSetting(AUDIO_OUTPUT_STORAGE_KEY, ""),
  };
}

export function LearningSettingsDialog({
  audioChangesDisabled = false,
  explanationStyleChangesDisabled = false,
  requestMicrophonePermission = true,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  onClose,
  onShowMessage,
}: {
  audioChangesDisabled?: boolean;
  explanationStyleChangesDisabled?: boolean;
  requestMicrophonePermission?: boolean;
  onSelectAudioInputDevice?: SelectAudioDevice;
  onSelectAudioOutputDevice?: SelectAudioDevice;
  onClose: () => void;
  onShowMessage: (message: string) => void;
}) {
  const {
    raiseHandShortcutLabel,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  } = useLearningSettings();
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [audioDevicesLoading, setAudioDevicesLoading] = useState(true);
  const [changingAudioDevice, setChangingAudioDevice] = useState<
    "input" | "output" | null
  >(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    function loadAudioDevices(requestPermission: boolean) {
      void getAudioDevices(requestPermission).then(
        ({ inputDevices, outputDevices }) => {
          if (!active) {
            return;
          }

          setAudioInputDevices(inputDevices);
          setAudioOutputDevices(outputDevices);
          setAudioDevicesLoading(false);
        },
        (reason: unknown) => {
          if (!active) {
            return;
          }

          setError(
            reason instanceof Error
              ? reason.message
              : "Audio devices could not be loaded.",
          );
          setAudioDevicesLoading(false);
        },
      );
    }

    loadAudioDevices(requestMicrophonePermission);

    function handleDeviceChange() {
      setAudioDevicesLoading(true);
      setError("");
      loadAudioDevices(false);
    }

    navigator.mediaDevices.addEventListener(
      "devicechange",
      handleDeviceChange,
    );
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [requestMicrophonePermission]);

  function recordRaiseHandShortcut(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecordingShortcut(false);
      setError("");
      return;
    }

    const shortcut = normalizeShortcut(event);

    if (!shortcut || RESERVED_SHORTCUT_KEYS.has(shortcut)) {
      setError(
        "Choose Space, a letter, or a number that is not E or T.",
      );
      return;
    }

    setRecordingShortcut(false);
    setError("");
    saveLocalSetting(RAISE_HAND_SHORTCUT_STORAGE_KEY, shortcut);
  }

  async function changeAudioInputDevice(deviceId: string) {
    setChangingAudioDevice("input");
    setError("");

    const changed = onSelectAudioInputDevice
      ? await onSelectAudioInputDevice(deviceId)
      : true;

    if (changed) {
      saveLocalSetting(AUDIO_INPUT_STORAGE_KEY, deviceId);
      onShowMessage("Microphone updated.");
    } else {
      setError("The selected microphone could not be activated.");
    }

    setChangingAudioDevice(null);
  }

  async function changeAudioOutputDevice(deviceId: string) {
    setChangingAudioDevice("output");
    setError("");

    const changed = onSelectAudioOutputDevice
      ? await onSelectAudioOutputDevice(deviceId)
      : true;

    if (changed) {
      saveLocalSetting(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
      onShowMessage("Speaker updated.");
    } else {
      setError("The selected speaker could not be activated.");
    }

    setChangingAudioDevice(null);
  }

  const audioFieldDisabled =
    audioChangesDisabled ||
    audioDevicesLoading ||
    changingAudioDevice !== null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-settings-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
        <div className="modal-icon">
          <Settings size={23} />
        </div>
        <p className="modal-eyebrow">Learning preferences</p>
        <h2 id="learning-settings-title">Settings</h2>
        <div className="settings-list">
          <section className="setting-field">
            <div>
              <label htmlFor="explanation-style">
                Explanation style
              </label>
              <p>Choose how much technical knowledge the tutor assumes.</p>
            </div>
            <select
              id="explanation-style"
              value={explanationStyle}
              onChange={(event) => {
                saveLocalSetting(
                  EXPLANATION_STYLE_STORAGE_KEY,
                  event.target.value,
                );
                onShowMessage("Explanation style updated.");
              }}
              disabled={explanationStyleChangesDisabled}
            >
              <option value="plain">Plain language</option>
              <option value="technical">Technical</option>
            </select>
          </section>

          <section className="setting-field">
            <div>
              <label htmlFor="raise-hand-shortcut">
                Raise-hand shortcut
              </label>
              <p>Use the same key to interrupt and finish speaking.</p>
            </div>
            <button
              id="raise-hand-shortcut"
              className={recordingShortcut ? "recording-shortcut" : ""}
              type="button"
              onClick={() => {
                setRecordingShortcut((recording) => !recording);
                setError("");
              }}
              onKeyDown={
                recordingShortcut ? recordRaiseHandShortcut : undefined
              }
            >
              {recordingShortcut
                ? "Press a key…"
                : raiseHandShortcutLabel}
            </button>
          </section>

          <section className="setting-field">
            <div>
              <label htmlFor="audio-input-device">Microphone</label>
              <p>The device that listens when your hand is raised.</p>
            </div>
            <select
              id="audio-input-device"
              value={audioInputDeviceId}
              onChange={(event) =>
                void changeAudioInputDevice(event.target.value)
              }
              disabled={audioFieldDisabled}
            >
              <option value="">System default</option>
              {audioInputDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getAudioDeviceLabel(device, "Microphone", index)}
                </option>
              ))}
            </select>
          </section>

          <section className="setting-field">
            <div>
              <label htmlFor="audio-output-device">Speaker</label>
              <p>The device used for the tutor&apos;s voice.</p>
            </div>
            <select
              id="audio-output-device"
              value={audioOutputDeviceId}
              onChange={(event) =>
                void changeAudioOutputDevice(event.target.value)
              }
              disabled={audioFieldDisabled}
            >
              <option value="">System default</option>
              {audioOutputDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getAudioDeviceLabel(device, "Speaker", index)}
                </option>
              ))}
            </select>
          </section>
        </div>
        {audioDevicesLoading && (
          <p className="settings-status">Loading audio devices…</p>
        )}
        {audioChangesDisabled && (
          <p className="settings-status">
            Audio devices cannot change while connecting or speaking.
          </p>
        )}
        {explanationStyleChangesDisabled ? (
          <p className="settings-status">
            End the active tutor session to change the explanation style.
          </p>
        ) : null}
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button modal-button"
          type="button"
          onClick={onClose}
        >
          Done
        </button>
      </section>
    </div>
  );
}

async function getAudioDevices(requestPermission: boolean) {
  if (requestPermission) {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    for (const track of permissionStream.getTracks()) {
      track.stop();
    }
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return {
    inputDevices: devices.filter(
      (device) => device.kind === "audioinput",
    ),
    outputDevices: devices.filter(
      (device) => device.kind === "audiooutput",
    ),
  };
}

function useLocalSetting(key: string, fallback: string) {
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(key) ?? fallback,
    [fallback, key],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  return useSyncExternalStore(
    subscribeToLocalSettings,
    getSnapshot,
    getServerSnapshot,
  );
}

function subscribeToLocalSettings(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCAL_SETTINGS_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCAL_SETTINGS_EVENT, onStoreChange);
  };
}

function saveLocalSetting(key: string, value: string) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(LOCAL_SETTINGS_EVENT));
}

function normalizeShortcut(
  event: ReactKeyboardEvent<HTMLButtonElement>,
) {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return null;
  }

  const key = event.key.toLowerCase();
  return key === " " || /^[a-z0-9]$/.test(key) ? key : null;
}

function formatShortcut(shortcut: string) {
  return shortcut === " " ? "Space" : shortcut.toUpperCase();
}

function getAudioDeviceLabel(
  device: MediaDeviceInfo,
  fallback: "Microphone" | "Speaker",
  index: number,
) {
  return device.label || `${fallback} ${index + 1}`;
}
