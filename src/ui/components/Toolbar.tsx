import { useRef, type Dispatch } from 'react';
import { strToU8, zipSync } from 'fflate';
import { configPaths, customLayout, generateConfig, importConfig, type ZmkConfig } from '../../core/config.ts';
import { definitionPath } from '../../core/hardware/definition.ts';
import { generateKeymap } from '../../core/keymap/generator.ts';
import { textLayoutFor } from '../../core/layouts/index.ts';
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

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Maps picked files to repo paths; files not given keep the current config's contents. */
async function filesToConfig(files: File[], current: ZmkConfig): Promise<{ config: ZmkConfig; warnings: string[] }> {
  const keymapFile = files.find((f) => f.name.endsWith('.keymap'));
  if (!keymapFile) throw new Error('Pick a .keymap file (and optionally its .conf, west.yml, build.yaml and .editor.json).');
  const keyboard = keymapFile.name.replace(/\.keymap$/i, '');
  const paths = configPaths(keyboard);
  const repo: Record<string, string> = {};
  const existing = generateConfig({ ...current, keyboard });
  for (const path of [paths.kconfig, paths.west, paths.build]) {
    const text = existing[path];
    if (text !== undefined) repo[path] = text;
  }
  for (const file of files) {
    const text = await file.text();
    if (file === keymapFile) repo[paths.keymap] = text;
    else if (file.name.endsWith('.conf')) repo[paths.kconfig] = text;
    else if (/^west\.ya?ml$/.test(file.name)) repo[paths.west] = text;
    else if (/^build\.ya?ml$/.test(file.name)) repo[paths.build] = text;
    else if (file.name.endsWith('.editor.json')) repo[definitionPath(keyboard)] = text;
    else if (file.name === 'info.json') repo[paths.info] = text;
  }
  return importConfig(repo, keyboard);
}

export function Toolbar({ config, canUndo, canRedo, theme, onToggleTheme, dispatch }: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const openFiles = async (files: File[]) => {
    try {
      const { config: next, warnings } = await filesToConfig(files, config);
      if (next.keymap.layers.length === 0) throw new Error("That keymap has no layers, so it can't be edited here.");
      dispatch({ type: 'load', config: next, warnings });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const downloadKeymap = () => {
    const text = generateKeymap(config.keymap, textLayoutFor(config.keyboard, config.keymap.layers[0]?.bindings.length ?? 0, customLayout(config)));
    save(new Blob([text], { type: 'text/plain' }), `${config.keyboard}.keymap`);
  };

  const downloadZip = () => {
    const files = Object.fromEntries(Object.entries(generateConfig(config)).map(([path, text]) => [path, strToU8(text)]));
    save(new Blob([zipSync(files)], { type: 'application/zip' }), `zmk-config-${config.keyboard}.zip`);
  };

  const resetDemo = () => {
    if (window.confirm('Replace the editor contents with the Lily58 demo config?')) {
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
      <button
        type="button"
        className="button"
        onClick={() => fileInput.current?.click()}
        title="Pick your .keymap, and optionally its .conf, west.yml, build.yaml and .editor.json"
      >
        Open files
      </button>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".keymap,.conf,.yml,.yaml,.json"
        hidden
        data-testid="config-files"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0) void openFiles(files);
          e.target.value = '';
        }}
      />
      <button type="button" className="button" onClick={downloadKeymap}>
        Download .keymap
      </button>
      <button type="button" className="button" onClick={downloadZip} title="Keymap, .conf, west.yml, build.yaml and the build workflow">
        Download config (.zip)
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
