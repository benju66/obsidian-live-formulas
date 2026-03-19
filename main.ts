import { Plugin, MarkdownPostProcessorContext, Menu, Editor, MarkdownView } from 'obsidian';
import { renderTableUI } from './ui';
import { LiveFormulasSettingTab, LiveFormulasSettings, DEFAULT_SETTINGS } from './settings';

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

                const saveContent = async (newData: any) => {
                    const section = ctx.getSectionInfo(el);
                    if (!section) return;
                    const file = this.app.workspace.getActiveFile();
                    if (!file) return;

                    await this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const newJson = JSON.stringify(newData, null, 2);
                        lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, newJson);
                        return lines.join('\n');
                    });
                };

                renderTableUI(el, tableData, this.settings, saveContent);
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
    }
}
