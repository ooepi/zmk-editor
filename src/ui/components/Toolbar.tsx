import { useRef, type Dispatch } from 'react';
import { strToU8, zipSync } from 'fflate';
import { configPaths, customLayout, generateConfig, importConfig, type ZmkConfig } from '../../core/config.ts';
import { definitionPath } from '../../core/hardware/definition.ts';
import { generateKeymap } from '../../core/keymap/generator.ts';
import { textLayoutFor } from '../../core/layouts/index.ts';
import type { PublicRepo } from '../../core/github/publicRepo.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { IconButton } from './ui/IconButton.tsx';
import { Menu } from './ui/Menu.tsx';
import { OpenFromGitHub } from './OpenFromGitHub.tsx';
import { demoConfig } from '../state/demo.ts';

interface ToolbarProps {
  config: ZmkConfig;
  canUndo: boolean;
  canRedo: boolean;
  /** True while the keyboard wizard has a draft of `config` open; undo, redo, opening files and resetting to the demo would change it behind the wizard's back. */
  locked?: boolean;
  /** Opens the printable cheat sheet. */
  onPrint: () => void;
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
  for (const path of [paths.kconfig, paths.west, paths.build, definitionPath(keyboard)]) {
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

export function Toolbar({ config, canUndo, canRedo, locked, onPrint, dispatch }: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const lockedTitle = 'Finish or cancel the keyboard wizard first.';

  const openFiles = async (files: File[]) => {
    try {
      const { config: next, warnings } = await filesToConfig(files, config);
      if (next.keymap.layers.length === 0) throw new Error("That keymap has no layers, so it can't be edited here.");
      dispatch({ type: 'load', config: next, warnings });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const openRepo = (repo: PublicRepo) => {
    const name = `${repo.owner}/${repo.repo} (${repo.branch})`;
    if (!window.confirm(`Replace the editor contents with ${name}?`)) return;
    try {
      const { config: next, warnings } = importConfig(repo.files);
      if (next.keymap.layers.length === 0) throw new Error("That keymap has no layers, so it can't be edited here.");
      dispatch({ type: 'load', config: next, warnings });
      dispatch({ type: 'notify', notice: `Opened ${name}. To commit changes, connect to your own repository on the Build & flash tab.` });
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
    <div className="toolbar" role="toolbar" aria-label="Keymap actions">
      <IconButton
        icon="undo"
        label="Undo"
        disabled={!canUndo || locked}
        title={locked ? lockedTitle : 'Undo (Ctrl+Z)'}
        onClick={() => dispatch({ type: 'undo' })}
      />
      <IconButton
        icon="redo"
        label="Redo"
        disabled={!canRedo || locked}
        title={locked ? lockedTitle : 'Redo (Ctrl+Shift+Z)'}
        onClick={() => dispatch({ type: 'redo' })}
      />
      <span className="toolbar-sep" aria-hidden="true" />
      <OpenFromGitHub disabled={locked} title={locked ? lockedTitle : undefined} onOpened={openRepo} />
      <IconButton
        icon="print"
        label="Print keymap"
        expand
        disabled={locked}
        title={locked ? lockedTitle : 'A cheat sheet of every layer, to print or save as PDF'}
        onClick={onPrint}
      />
      <Menu
        label="More actions"
        items={[
          {
            label: 'Open files',
            icon: 'open',
            disabled: !!locked,
            title: locked ? lockedTitle : 'Pick your .keymap, and optionally its .conf, west.yml, build.yaml and .editor.json',
            onSelect: () => fileInput.current?.click(),
          },
          { label: 'Download .keymap', icon: 'download', onSelect: downloadKeymap },
          {
            label: 'Download config (.zip)',
            icon: 'archive',
            title: 'Keymap, .conf, west.yml, build.yaml and the build workflow',
            onSelect: downloadZip,
          },
          'separator',
          { label: 'Reset to demo', icon: 'reset', tone: 'danger', disabled: !!locked, title: locked ? lockedTitle : undefined, onSelect: resetDemo },
        ]}
      />
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
    </div>
  );
}
