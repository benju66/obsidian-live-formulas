import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type LiveFormulasPlugin from '../main';

class FormulaWidget extends WidgetType {
    constructor(readonly result: string) {
        super();
    }

    eq(other: FormulaWidget) {
        return other.result === this.result;
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'live-formula-native-widget';
        span.textContent = this.result;
        span.style.color = 'var(--text-accent)';
        span.style.fontWeight = 'bold';
        return span;
    }
}

/** Reserved for wiring MathEngine / settings; kept for a stable extension factory signature. */
export function buildNativeTablePlugin(_plugin: LiveFormulasPlugin) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            buildDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const selection = view.state.selection.main;

                for (const { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);
                    const regex = /\|\s*(=[^|]+?)\s*(?=\|)/g;
                    let match: RegExpExecArray | null;

                    while ((match = regex.exec(text)) !== null) {
                        const eqInMatch = match[0].indexOf('=');
                        const start = from + match.index + eqInMatch;
                        const end = start + match[1].length;

                        const cellStart = from + match.index;
                        const cellEnd = cellStart + match[0].length;

                        if (selection.head >= cellStart && selection.head <= cellEnd) {
                            continue;
                        }

                        builder.add(
                            start,
                            end,
                            Decoration.replace({
                                widget: new FormulaWidget(`[Calc: ${match[1]}]`),
                            })
                        );
                    }
                }
                return builder.finish();
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    );
}
