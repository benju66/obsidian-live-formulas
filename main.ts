import {
    Plugin,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    Menu,
    Editor,
    MarkdownView,
    Notice,
    debounce,
    Debouncer,
} from 'obsidian';
import { renderTableUI } from './ui';
import { LiveFormulasSettingTab, LiveFormulasSettings, DEFAULT_SETTINGS } from './settings';
import { TableState } from './tableState';

class LiveTableSaveLifecycle extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly saveStateToFile: Debouncer<[], void>,
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

    private liveTableBlocks = new Set<Debouncer<[], void>>();

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

                const performSave = () => {
                    if (!state.dirty) return;
                    const sectionHint = ctx.getSectionInfo(el);
                    if (!sectionHint) return;
                    const file = this.app.vault.getFileByPath(ctx.sourcePath);
                    if (!file) return;

                    const md = state.toMarkdownText();
                    state.clearDirty();

                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const isActiveEditor = activeView && activeView.file?.path === file.path;

                    if (isActiveEditor && activeView) {
                        const editor = activeView.editor;
                        const blockText = '```live-table\n' + md + '\n```';

                        const openLine = editor.getLine(sectionHint.lineStart) ?? '';
                        const closeLine = editor.getLine(sectionHint.lineEnd) ?? '';

                        if (
                            openLine.trimStart().startsWith('```live-table') &&
                            closeLine.trimStart().startsWith('```')
                        ) {
                            editor.replaceRange(
                                blockText,
                                { line: sectionHint.lineStart, ch: 0 },
                                { line: sectionHint.lineEnd, ch: closeLine.length }
                            );
                            return;
                        }

                        console.log('Live Formulas: Document shifted in Editor. Dynamically locating table block...');
                        let foundStart = -1;
                        let foundEnd = -1;

                        const tableIdString = state.tableName ? `"tableName":"${state.tableName}"` : '';
                        const lineCount = editor.lineCount();

                        for (let i = sectionHint.lineStart; i >= 0 && i < lineCount; i--) {
                            if (editor.getLine(i).trimStart().startsWith('```live-table')) {
                                const nextLine = editor.getLine(i + 1) || '';
                                if (!tableIdString || nextLine.includes(tableIdString)) {
                                    foundStart = i;
                                    break;
                                }
                            }
                        }
                        if (foundStart === -1) {
                            for (let i = sectionHint.lineStart + 1; i < lineCount; i++) {
                                if (editor.getLine(i).trimStart().startsWith('```live-table')) {
                                    const nextLine = editor.getLine(i + 1) || '';
                                    if (!tableIdString || nextLine.includes(tableIdString)) {
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
                            editor.replaceRange(
                                blockText,
                                { line: foundStart, ch: 0 },
                                { line: foundEnd, ch: editor.getLine(foundEnd).length }
                            );
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

                        console.log('Live Formulas: Document shifted (Background). Dynamically locating table block...');
                        let foundStart = -1;
                        let foundEnd = -1;

                        const tableIdString = state.tableName ? `"tableName":"${state.tableName}"` : '';

                        for (let i = sectionHint.lineStart; i >= 0 && i < lines.length; i--) {
                            if (lines[i].trimStart().startsWith('```live-table')) {
                                const nextLine = lines[i + 1] || '';
                                if (!tableIdString || nextLine.includes(tableIdString)) {
                                    foundStart = i;
                                    break;
                                }
                            }
                        }
                        if (foundStart === -1) {
                            for (let i = sectionHint.lineStart + 1; i < lines.length; i++) {
                                if (lines[i].trimStart().startsWith('```live-table')) {
                                    const nextLine = lines[i + 1] || '';
                                    if (!tableIdString || nextLine.includes(tableIdString)) {
                                        foundStart = i;
                                        break;
                                    }
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

                        console.warn(
                            'Live Formulas: Could not locate table block after document shift. Aborting save.'
                        );
                        new Notice(
                            'Live Formulas: Document shifted drastically. Save aborted to prevent data loss. Please manually re-trigger save.'
                        );
                        state.markDirty();
                        return data;
                    });
                };

                const saveStateToFile = debounce(performSave, 400, true);
                (saveStateToFile as any).forceSave = performSave;

                const unregister = () => {
                    this.liveTableBlocks.delete(saveStateToFile);
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
                this.liveTableBlocks.add(saveStateToFile);
                ctx.addChild(new LiveTableSaveLifecycle(el, saveStateToFile, unregister, () => destroyRef.current()));
            }
        );
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
