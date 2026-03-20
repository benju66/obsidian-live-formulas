import {
    Plugin,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    Menu,
    Editor,
    MarkdownView,
    debounce,
} from 'obsidian';
import { renderTableUI } from './ui';
import { LiveFormulasSettingTab, LiveFormulasSettings, DEFAULT_SETTINGS } from './settings';

/** Flushes debounced vault writes when the preview block is torn down (navigate away, re-render, etc.). */
class LiveTableSaveLifecycle extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly requestSave: { run: () => void },
        private readonly unregister: () => void
    ) {
        super(containerEl);
    }

    onunload(): void {
        this.requestSave.run();
        this.unregister();
    }
}

const DEFAULT_TABLE_JSON = JSON.stringify(
    {
        _format: {},
        A1: '',
        B1: '',
        A2: '',
        B2: '',
    },
    null,
    2
);

export default class LiveFormulasPlugin extends Plugin {
    settings: LiveFormulasSettings;

    /** Debounced savers still waiting to write; flushed on block unload and plugin unload. */
    private pendingTableSaves = new Set<{ run: () => void }>();

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
                let tableData: any = {};
                try {
                    tableData = source.trim() ? JSON.parse(source) : {};
                } catch (e) {
                    el.createEl('div', { text: 'Error reading table data.', attr: { style: 'color: red;' } });
                    return;
                }

                // Third argument `true` = resetTimer: postpone until 600ms after the last call (standard debounce).
                const requestSave = debounce((newData: any) => {
                    const section = ctx.getSectionInfo(el);
                    if (!section) return;
                    const file = this.app.vault.getFileByPath(ctx.sourcePath);
                    if (!file) return;

                    void this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const newJson = JSON.stringify(newData, null, 2);
                        lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, newJson);
                        return lines.join('\n');
                    });
                }, 3000, true);

                this.pendingTableSaves.add(requestSave);
                const unregisterSaver = () => {
                    this.pendingTableSaves.delete(requestSave);
                };
                ctx.addChild(new LiveTableSaveLifecycle(el, requestSave, unregisterSaver));

                const saveContent = async (newData: any) => {
                    requestSave(newData);
                };

                const flushSave = () => {
                    requestSave.run();
                };

                const toggleHeaders = async () => {
                    this.settings.showHeaders = !this.settings.showHeaders;
                    await this.saveSettings();

                    el.empty();
                    renderTableUI(el, tableData, this.settings, saveContent, toggleHeaders, flushSave);
                };

                renderTableUI(el, tableData, this.settings, saveContent, toggleHeaders, flushSave);
            }
        );
    }

    insertDefaultTable() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const block = '```live-table\n' + DEFAULT_TABLE_JSON + '\n```\n';
        activeView.editor.replaceSelection(block);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        for (const saver of this.pendingTableSaves) {
            saver.run();
        }
        this.pendingTableSaves.clear();
    }
}
