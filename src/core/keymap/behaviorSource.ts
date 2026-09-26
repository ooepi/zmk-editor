import type { DtNode } from '../dts/ast.ts';
import { printNode } from '../dts/printer.ts';
import { importKeymap } from './importer.ts';
import type { Behavior } from './model.ts';

export function behaviorNode(behavior: Behavior): DtNode {
  return {
    name: behavior.name,
    labels: behavior.label ? [behavior.label] : [],
    properties: [
      { name: 'compatible', values: [{ kind: 'string', value: behavior.compatible }] },
      ...behavior.properties,
      ...(behavior.bindings.length > 0
        ? [
            {
              name: 'bindings',
              values: behavior.bindings.map((b) => ({ kind: 'cells' as const, tokens: [`&${b.behavior}`, ...b.params] })),
            },
          ]
        : []),
    ],
    children: behavior.children ?? [],
  };
}

/** A behavior as devicetree source, e.g. `leader: leader { … };`. */
export function behaviorSource(behavior: Behavior): string {
  return printNode(behaviorNode(behavior), 0);
}

export type ParsedBehavior = { ok: true; behavior: Behavior } | { ok: false; error: string };

/** Reads one behavior node written as source; says what's wrong otherwise. */
export function parseBehaviorSource(text: string): ParsedBehavior {
  let behaviors: Behavior[];
  try {
    const { model } = importKeymap(`/ {\n    behaviors {\n${text}\n    };\n};\n`);
    if (model.topLevel.some((i) => i.kind === 'raw') || model.extraNodes.length > 0) {
      return { ok: false, error: 'Write one node like name: name { compatible = "…"; … }; with nothing around it.' };
    }
    behaviors = model.behaviors;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const [behavior, ...rest] = behaviors;
  if (!behavior || rest.length > 0) return { ok: false, error: 'Write exactly one behavior node.' };
  if (!behavior.label) return { ok: false, error: 'The node needs a label, like leader: leader { … };' };
  return { ok: true, behavior };
}
