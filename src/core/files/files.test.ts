import { describe, expect, it } from 'vitest';
import { generateKconfig, parseKconfig } from './kconfig.ts';
import { findVersionMismatches, generateWestManifest, parseWestManifest } from './west.ts';
import { generateBuildMatrix, parseBuildMatrix } from './build.ts';
import { generateWorkflow } from './workflow.ts';
import { yamlScalar } from './yaml-util.ts';

describe('kconfig', () => {
  it('keeps settings, comments and blank lines', () => {
    const text = '# Encoder\nCONFIG_EC11=y\t\n\n#CONFIG_OLD=y\nCONFIG_TIMEOUT = 300000\n';
    const model = parseKconfig(text);
    expect(model.lines).toEqual([
      { kind: 'comment', text: '# Encoder' },
      { kind: 'set', name: 'CONFIG_EC11', value: 'y' },
      { kind: 'blank' },
      { kind: 'comment', text: '#CONFIG_OLD=y' },
      { kind: 'set', name: 'CONFIG_TIMEOUT', value: '300000' },
    ]);
    expect(generateKconfig(model)).toBe('# Encoder\nCONFIG_EC11=y\n\n#CONFIG_OLD=y\nCONFIG_TIMEOUT=300000\n');
  });

  it('drops trailing blank lines so output is stable', () => {
    expect(parseKconfig('CONFIG_A=y\n\n\n').lines).toEqual([{ kind: 'set', name: 'CONFIG_A', value: 'y' }]);
  });
});

const WEST = `
manifest:
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware
    - name: urob
      url-base: https://github.com/urob
  projects:
    - name: zmk
      remote: zmkfirmware
      revision: v0.3
      import: app/west.yml
    - name: zmk-helpers
      remote: urob
      revision: v0.3
    - name: zmk-nice-oled
      url: https://github.com/mctechnology17/zmk-nice-oled
      revision: main
  self:
    path: config
`;

describe('west.yml', () => {
  const { model, warnings } = parseWestManifest(WEST);

  it('reads the ZMK version and modules; modules on that version follow it', () => {
    expect(warnings).toEqual([]);
    expect(model).toEqual({
      zmkVersion: 'v0.3',
      modules: [
        { name: 'zmk-helpers', remote: 'urob', urlBase: 'https://github.com/urob' },
        {
          name: 'zmk-nice-oled',
          remote: 'mctechnology17',
          urlBase: 'https://github.com/mctechnology17',
          revision: 'main',
        },
      ],
      selfPath: 'config',
    });
  });

  it('lists modules pinned to another ref', () => {
    expect(findVersionMismatches(model)).toEqual([{ module: 'zmk-nice-oled', revision: 'main', zmkVersion: 'v0.3' }]);
  });

  it('pins every following module to the ZMK version', () => {
    const text = generateWestManifest({ ...model, zmkVersion: 'v0.4' });
    expect(text).toBe(`manifest:
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware
    - name: urob
      url-base: https://github.com/urob
    - name: mctechnology17
      url-base: https://github.com/mctechnology17
  projects:
    - name: zmk
      remote: zmkfirmware
      revision: v0.4
      import: app/west.yml
    - name: zmk-helpers
      remote: urob
      revision: v0.4
    - name: zmk-nice-oled
      remote: mctechnology17
      revision: main
  self:
    path: config
`);
    expect(parseWestManifest(text).model).toEqual({ ...model, zmkVersion: 'v0.4' });
  });

  it('fails clearly without a zmk project', () => {
    expect(() => parseWestManifest('manifest:\n  projects: []\n')).toThrow(/zmk/);
  });
});

describe('build.yaml', () => {
  it('reads the include matrix', () => {
    const model = parseBuildMatrix(`
include:
  - board: nice_nano_v2
    shield: corne_left
    snippet: studio-rpc-usb-uart
    cmake-args: -DCONFIG_ZMK_STUDIO=y
    artifact-name: corne_left_with_studio
`);
    expect(model.include).toEqual([
      {
        board: 'nice_nano_v2',
        shield: 'corne_left',
        snippet: 'studio-rpc-usb-uart',
        cmakeArgs: '-DCONFIG_ZMK_STUDIO=y',
        artifactName: 'corne_left_with_studio',
      },
    ]);
    expect(parseBuildMatrix(generateBuildMatrix(model))).toEqual(model);
  });

  it('expands top-level board and shield arrays', () => {
    const model = parseBuildMatrix('board: [nice_nano_v2]\nshield: [a, b]\ninclude:\n  - board: bdn9_rev2\n');
    expect(model.include).toEqual([
      { board: 'nice_nano_v2', shield: 'a' },
      { board: 'nice_nano_v2', shield: 'b' },
      { board: 'bdn9_rev2' },
    ]);
  });

  it('quotes values that YAML would misread', () => {
    const text = generateBuildMatrix({ include: [{ board: 'b', cmakeArgs: '-DX="a: b"' }] });
    expect(parseBuildMatrix(text).include).toEqual([{ board: 'b', cmakeArgs: '-DX="a: b"' }]);
  });
});

describe('workflow', () => {
  it('uses the build workflow of the selected ZMK version', () => {
    expect(generateWorkflow('v0.3')).toContain('uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@v0.3');
  });
});

describe('yamlScalar', () => {
  it('quotes values YAML would read as another type', () => {
    expect(yamlScalar('v0.3')).toBe('v0.3');
    expect(yamlScalar('https://github.com/urob')).toBe('https://github.com/urob');
    expect(yamlScalar('1.0')).toBe('"1.0"');
    expect(yamlScalar('true')).toBe('"true"');
    expect(yamlScalar('a: b')).toBe('"a: b"');
  });
});
