import { useRef, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { generateKeymap } from '../../core/keymap/generator.ts';
import { importKeymap } from '../../core/keymap/importer.ts';
import { getTextLayout } from '../../core/layouts/index.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { demoConfig } from '../state/demo.ts';
import type { Theme } from '../useTheme.ts';

interface ToolbarProps {
  config: ZmkConfig;
  canUndo: boolean;
  canRedo: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  dispatch: Dispatch<EditorAction>;
}

export function Toolbar({ config, canUndo, canRedo, theme, onToggleTheme, dispatch }: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    const { model, warnings } = importKeymap(await file.text());
    if (model.layers.length === 0) {
      window.alert(`${file.name} has no layers, so it can't be edited here.`);
      return;
    }
    const keyboard = file.name.replace(/\.keymap$/i, '') || config.keyboard;
    dispatch({ type: 'load', config: { ...config, keyboard, keymap: model }, warnings });
  };

  const download = () => {
    const text = generateKeymap(config.keymap, getTextLayout(config.keyboard));
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.keyboard}.keymap`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetDemo = () => {
    if (window.confirm('Replace your changes with the Lily58 demo keymap?')) {
      const demo = demoConfig();
      dispatch({ type: 'load', config: demo.config, warnings: demo.warnings });
    }
  };

  return (
    <div className="toolbar">
      <button type="button" className="button" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" className="button" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <span className="toolbar-sep" />
      <button type="button" className="button" onClick={() => fileInput.current?.click()}>
        Open .keymap
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".keymap,.dtsi,text/plain"
        hidden
        data-testid="keymap-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" className="button" onClick={download}>
        Download .keymap
      </button>
      <button type="button" className="button" onClick={resetDemo}>
        Reset to demo
      </button>
      <span className="toolbar-sep" />
      <button type="button" className="button" onClick={onToggleTheme}>
        {theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </button>
    </div>
  );
}
