import {
    Plugin,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    Menu,
    Editor,
    MarkdownView,
} from 'obsidian';
import { renderTableUI } from './ui';
import { LiveFormulasSettingTab, LiveFormulasSettings, DEFAULT_SETTINGS } from './settings';
import { TableState, columnIndexToLetters } from './tableState';
import { MathEngine } from './math';
import { buildNativeTableExtensions } from './src/nativeTablePlugin';

class LiveTableSaveLifecycle extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly saveStateToFile: () => void,
        private readonly unregister: () => void,
        private readonly destroyUI: () => void
    ) {
        super(containerEl);
    }

    onunload(): void {
        if (this.saveStateToFile && typeof (this.saveStateToFile as any).forceSave === 'function') {
            (this.saveStateToFile as any).forceSave();
        }
        this.unregister();
        this.destroyUI();
    }
}

function defaultTableMarkdown(settings: LiveFormulasSettings): string {
    const s = new TableState();
    const rows = Math.min(50, Math.max(1, settings.defaultRows));
    const cols = Math.min(50, Math.max(1, settings.defaultCols));
    s.seedDefaultGrid(rows, cols);
    return s.toMarkdownText();
}

export default class LiveFormulasPlugin extends Plugin {
    settings: LiveFormulasSettings;

    private liveTableBlocks = new Set<() => void>();

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new LiveFormulasSettingTab(this.app, this));

        this.addRibbonIcon('table', 'Insert Live Formula Table', () => {
            this.insertDefaultTable();
        });

        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, _editor: Editor, _view: MarkdownView) => {
                menu.addItem((item) => {
                    item.setTitle('Insert Live Formula Table')
                        .setIcon('table')
                        .onClick(() => {
                            this.insertDefaultTable();
                        });
                });
            })
        );

        this.registerMarkdownCodeBlockProcessor(
            'live-table',
            (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                const state = TableState.parseBlockSource(source);

                const replaceWithoutScroll = (editor: Editor, text: string, fromLine: number, toLine: number) => {
                    const from = { line: fromLine, ch: 0 };
                    const to = { line: toLine, ch: editor.getLine(toLine).length };
                    
                    const cm = (editor as any).cm;
                    if (cm && typeof cm.dispatch === 'function') {
                        const fromOffset = editor.posToOffset(from);
                        const toOffset = editor.posToOffset(to);
                        cm.dispatch({
                            changes: { from: fromOffset, to: toOffset, insert: text },
                            scrollIntoView: false
                        });
                    } else {
                        editor.replaceRange(text, from, to);
                    }
                };

                const performSave = () => {
                    if (!state.dirty) return;

                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

                    const sectionInfo = ctx.getSectionInfo(el);

                    if (!view || !sectionInfo) {
                        const file = this.app.vault.getFileByPath(ctx.sourcePath);
                        if (!file) return;

                        const md = state.toMarkdownText();
                        state.clearDirty();

                        if (
                            openLine.trimStart().startsWith('```live-table') &&
                            closeLine.trimStart().startsWith('```')
                        ) {
                            replaceWithoutScroll(editor, blockText, sectionHint.lineStart, sectionHint.lineEnd);
                            return;
                        }

                            let foundStart = -1;
                            let foundEnd = -1;

                        const tableIdString = `"id":"${state.id}"`;
                        const lineCount = editor.lineCount();

                        for (let i = sectionHint.lineStart; i >= 0 && i < lineCount; i--) {
                            if (editor.getLine(i).trimStart().startsWith('```live-table')) {
                                const nextLine = editor.getLine(i + 1) || '';
                                if (nextLine.includes(tableIdString)) {
                                    foundStart = i;
                                    break;
                                }
                            }
                        }
                        if (foundStart === -1) {
                            for (let i = sectionHint.lineStart + 1; i < lineCount; i++) {
                                if (editor.getLine(i).trimStart().startsWith('```live-table')) {
                                    const nextLine = editor.getLine(i + 1) || '';
                                    if (nextLine.includes(tableIdString)) {
                                        foundStart = i;
                                        break;
                                    }
                                }
                            }
                        }

                        if (foundStart !== -1) {
                            for (let i = foundStart + 1; i < lineCount; i++) {
                                if (editor.getLine(i).trimStart().startsWith('```')) {
                                    foundEnd = i;
                                    break;
                                }
                            }
                        }

                        if (foundStart !== -1 && foundEnd !== -1) {
                            replaceWithoutScroll(editor, blockText, foundStart, foundEnd);
                            return;
                        }

                        console.warn(
                            'Live Formulas: Could not locate table block in Editor after document shift. Aborting save.'
                        );
                        new Notice(
                            'Live Formulas: Document shifted drastically. Save aborted to prevent data loss. Please manually re-trigger save.'
                        );
                        state.markDirty();
                        return;
                    }

                    void this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const newLines = md.split('\n');

                        const openLine = lines[sectionHint.lineStart] ?? '';
                        const closeLine = lines[sectionHint.lineEnd] ?? '';

                        if (
                            openLine.trimStart().startsWith('```live-table') &&
                            closeLine.trimStart().startsWith('```')
                        ) {
                            lines.splice(
                                sectionHint.lineStart + 1,
                                sectionHint.lineEnd - sectionHint.lineStart - 1,
                                ...newLines
                            );
                            return lines.join('\n');
                        }

                        let foundStart = -1;
                        let foundEnd = -1;

                        const tableIdString = `"id":"${state.id}"`;

                        for (let i = sectionHint.lineStart; i >= 0 && i < lines.length; i--) {
                            if (lines[i].trimStart().startsWith('```live-table')) {
                                const nextLine = lines[i + 1] || '';
                                if (nextLine.includes(tableIdString)) {
                                    foundStart = i;
                                    break;
                                }
                            }
                        }
                        if (foundStart === -1) {
                            for (let i = sectionHint.lineStart + 1; i < lines.length; i++) {
                                if (lines[i].trimStart().startsWith('```live-table')) {
                                    const nextLine = lines[i + 1] || '';
                                    if (nextLine.includes(tableIdString)) {
                                        foundStart = i;
                                        break;
                                    }
                                }
                            }

                            if (foundStart !== -1) {
                                for (let i = foundStart + 1; i < lines.length; i++) {
                                    if (lines[i].trimStart().startsWith('```')) {
                                        foundEnd = i;
                                        break;
                                    }
                                }
                            }

                            if (foundStart !== -1 && foundEnd !== -1) {
                                lines.splice(foundStart + 1, foundEnd - foundStart - 1, ...newLines);
                                return lines.join('\n');
                            }
                            return data;
                        });
                        return;
                    }

                    const md = state.toMarkdownText();
                    state.clearDirty();

                    const editor = view.editor;
                    const startLine = sectionInfo.lineStart + 1;
                    const endLine = sectionInfo.lineEnd;

                    const scrollInfo = editor.getScrollInfo();
                    const cursor = editor.getCursor();

                    editor.replaceRange(md + '\n', { line: startLine, ch: 0 }, { line: endLine, ch: 0 });

                    // Restore after CM applies the update; setCursor can scroll the caret into view and
                    // overwrite a synchronous scrollTo if we don't re-apply after.
                    requestAnimationFrame(() => {
                        editor.scrollTo(scrollInfo.left, scrollInfo.top);
                        editor.setCursor(cursor);
                        requestAnimationFrame(() => {
                            editor.scrollTo(scrollInfo.left, scrollInfo.top);
                        });
                    });
                };

                const saveStateToFile = performSave as any;
                saveStateToFile.forceSave = performSave;

                const unregister = () => {
                    this.liveTableBlocks.delete(performSave);
                };
                const destroyRef = { current: () => {} };

                const toggleHeaders = async () => {
                    performSave();
                    this.settings.showHeaders = !this.settings.showHeaders;
                    await this.saveSettings();

                    state.clearDirty();
                    destroyRef.current();
                    el.empty();
                    renderTableUI(el, state, this.settings, saveStateToFile, toggleHeaders, () => this.saveSettings(), destroyRef);
                };

                renderTableUI(el, state, this.settings, saveStateToFile, toggleHeaders, () => this.saveSettings(), destroyRef);
                this.liveTableBlocks.add(performSave);
                ctx.addChild(new LiveTableSaveLifecycle(el, performSave, unregister, () => destroyRef.current()));
            }
        );

        if (this.settings.experimentalNativeTables) {
            this.registerEditorExtension(buildNativeTableExtensions(this));

            this.registerMarkdownPostProcessor((element, _context) => {
                const tables = element.querySelectorAll('table');
                tables.forEach((tableEl) => {
                    if (tableEl.classList.contains('live-formula-table')) return;

                    const tbody = tableEl.querySelector('tbody');
                    if (!tbody) return;

                    const dataRows = Array.from(tbody.querySelectorAll('tr'));
                    if (dataRows.length === 0) return;

                    const state = new TableState();

                    dataRows.forEach((tr, rIdx) => {
                        const rowNum = rIdx + 1;
                        const cells = Array.from(tr.querySelectorAll('td, th'));

                        cells.forEach((td, cIdx) => {
                            const colIdx = cIdx + 1;
                            const cellId = `${columnIndexToLetters(colIdx)}${rowNum}`;
                            const text = td.textContent?.trim() || '';

                            let formula: string | undefined = undefined;
                            let value: any = text;

                            if (text.startsWith('=')) {
                                formula = text;
                            } else {
                                const stripped = text.replace(/,/g, '');
                                const asNum = Number(stripped);
                                if (!isNaN(asNum) && stripped !== '') {
                                    value = asNum;
                                }
                            }

                            state.setCell(cellId, { value, formula, format: {} });
                        });
                    });

                    const engine = new MathEngine(state);

                    dataRows.forEach((tr, rIdx) => {
                        const rowNum = rIdx + 1;
                        const cells = Array.from(tr.querySelectorAll('td, th'));

                        cells.forEach((td, cIdx) => {
                            const colIdx = cIdx + 1;
                            const cellId = `${columnIndexToLetters(colIdx)}${rowNum}`;
                            const cell = state.getCell(cellId);

                            if (cell?.formula) {
                                const result = engine.evaluateFormula(cell.formula);

                                td.textContent = '';
                                const span = document.createElement('span');
                                span.className = 'live-formula-native-widget';
                                span.textContent = String(result);
                                span.style.color = 'var(--text-accent)';
                                span.style.fontWeight = 'bold';
                                td.appendChild(span);
                            }
                        });
                    });
                });
            });
        }
    }

    insertDefaultTable() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const block = '```live-table\n' + defaultTableMarkdown(this.settings) + '\n```\n';
        activeView.editor.replaceSelection(block);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        for (const save of this.liveTableBlocks) {
            if (typeof (save as any).forceSave === 'function') {
                (save as any).forceSave();
            }
        }
        this.liveTableBlocks.clear();
    }
}
