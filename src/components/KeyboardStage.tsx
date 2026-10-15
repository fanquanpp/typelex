/**
 * KeyboardStage — mounts the Three.js keyboard and keeps it in sync with props.
 *
 * Key presses are deliberately *not* driven through React state: the typing
 * engine calls `scene.press(code)` directly on the instance handed back by
 * `onReady`, so a keystroke never triggers a re-render.
 */
import { useEffect, useRef } from 'react';

import type { Theme } from '../lib/types';
import { KeyboardScene } from '../three/keyboard/KeyboardScene';
import type { RgbStyle } from '../three/keyboard/models';
import './Keyboard.css';

export interface KeyboardStageProps {
  modelId: string;
  theme: Theme;
  fingerHints: boolean;
  showNextKey: boolean;
  rgbStyle: RgbStyle;
  interactive: boolean;
  onReady?: (scene: KeyboardScene | null) => void;
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
  const sceneRef = useRef<KeyboardScene | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const clickRef = useRef(onKeyClick);
  clickRef.current = onKeyClick;

  /* The scene is created once; every option below is pushed imperatively so a
     keystroke never re-renders React. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let scene: KeyboardScene;
    try {
      scene = new KeyboardScene(container, {
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
