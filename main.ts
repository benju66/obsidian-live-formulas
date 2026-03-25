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
import { TableState } from './tableState';

class LiveTableSaveLifecycle extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly saveStateToFile: () => void,
        private readonly unregister: () => void
    ) {
        super(containerEl);
    }

    onunload(): void {
        this.saveStateToFile();
        this.unregister();
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

                const saveStateToFile = () => {
                    if (!state.dirty) return;
                    const section = ctx.getSectionInfo(el);
                    if (!section) return;
                    const file = this.app.vault.getFileByPath(ctx.sourcePath);
                    if (!file) return;
                    const md = state.toMarkdownText();

                    state.clearDirty();

                    void this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const newLines = md.split('\n');

                        const openLine = lines[section.lineStart] ?? '';
                        const closeLine = lines[section.lineEnd] ?? '';
                        if (
                            openLine.trimStart().startsWith('```live-table') &&
                            closeLine.trimStart().startsWith('```')
                        ) {
                            lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, ...newLines);
                        } else {
                            console.warn(
                                'Live Formulas: Document shifted during async write. Aborting save to prevent corruption.'
                            );
                            state.markDirty();
                            return data;
                        }

                        return lines.join('\n');
                    });
                };

                const unregister = () => {
                    this.liveTableBlocks.delete(saveStateToFile);
                };
                this.liveTableBlocks.add(saveStateToFile);
                ctx.addChild(new LiveTableSaveLifecycle(el, saveStateToFile, unregister));

                const toggleHeaders = async () => {
                    saveStateToFile();
                    this.settings.showHeaders = !this.settings.showHeaders;
                    await this.saveSettings();

                    state.clearDirty();
                    el.empty();
                    renderTableUI(el, state, this.settings, saveStateToFile, toggleHeaders, () =>
                        this.saveSettings()
                    );
                };

                renderTableUI(el, state, this.settings, saveStateToFile, toggleHeaders, () =>
                    this.saveSettings()
                );
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
            save();
        }
        this.liveTableBlocks.clear();
    }
}
