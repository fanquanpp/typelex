/**
 * KeyboardStage — mounts the CSS-simulated keyboard and keeps it in sync.
 *
 * The 3D WebGL board was replaced by a DOM/CSS scene (same layout data, a
 * shallow tilt + pointer parallax instead of a full renderer): it renders
 * sharper, themes correctly, and costs a fraction of the GPU time. Key presses
 * are still imperative — the typing engine calls `scene.press(code)` directly
 * on the instance handed back by `onReady`, so a keystroke never re-renders.
 */
import { useEffect, useRef } from 'react';

import type { Theme } from '../lib/types';
import { CssKeyboardScene } from '../three/keyboard/CssKeyboardScene';
import type { RgbStyle } from '../three/keyboard/models';
import './Keyboard.css';

export interface KeyboardStageProps {
  modelId: string;
  theme: Theme;
  fingerHints: boolean;
  showNextKey: boolean;
  rgbStyle: RgbStyle;
  interactive: boolean;
  onReady?: (scene: CssKeyboardScene | null) => void;
  onKeyClick?: (code: string) => void;
  className?: string;
}

export const KeyboardStage = ({
  modelId,
  theme,
  fingerHints,
  showNextKey,
  rgbStyle,
  interactive,
  onReady,
  onKeyClick,
  className = ''
}: KeyboardStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CssKeyboardScene | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const clickRef = useRef(onKeyClick);
  clickRef.current = onKeyClick;

  /* The scene is created once; every option below is pushed imperatively so a
     keystroke never re-renders React. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let scene: CssKeyboardScene;
    try {
      scene = new CssKeyboardScene(container, {
        modelId,
        theme,
        fingerHints,
        showNextKey,
        rgbStyle,
        interactive,
        onKeyClick: code => clickRef.current?.(code)
      });
    } catch (error) {
      console.warn('Keyboard scene failed to initialise', error);
      return undefined;
    }
    sceneRef.current = scene;
    readyRef.current?.(scene);

    return () => {
      readyRef.current?.(null);
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setModel(modelId);
  }, [modelId]);

  useEffect(() => {
    sceneRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    sceneRef.current?.setFingerHints(fingerHints);
  }, [fingerHints]);

  useEffect(() => {
    sceneRef.current?.setShowNextKey(showNextKey);
  }, [showNextKey]);

  useEffect(() => {
    sceneRef.current?.setRgbStyle(rgbStyle);
  }, [rgbStyle]);

  return <div ref={containerRef} className={`keyboard-stage ${className}`.trim()} />;
};

export default KeyboardStage;
