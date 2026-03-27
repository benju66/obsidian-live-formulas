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
        this.saveStateToFile.run();
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

                    void this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const newLines = md.split('\n');

                        // FAST PATH: Check if the original cached section is still perfectly valid
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

                        // SLOW PATH: Document shifted. Search outward from the original lineStart to find the new block bounds.
                        console.log('Live Formulas: Document shifted. Dynamically locating table block...');
                        let foundStart = -1;
                        let foundEnd = -1;

                        // FIX: Locate this exact table using its unique metadata ID
                        const tableIdString = state.tableName ? `"tableName":"${state.tableName}"` : '';

                        // Search backwards near the expected location
                        for (let i = sectionHint.lineStart; i >= 0 && i < lines.length; i--) {
                            if (lines[i].trimStart().startsWith('```live-table')) {
                                const nextLine = lines[i + 1] || '';
                                if (!tableIdString || nextLine.includes(tableIdString)) {
                                    foundStart = i;
                                    break;
                                }
                            }
                        }
                        // Search forwards if not found backwards
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

                        // If we still can't find it, abort to prevent corruption
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
            save.run();
        }
        this.liveTableBlocks.clear();
    }
}
