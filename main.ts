import { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import { renderTableUI } from './ui';
import { LiveFormulasSettingTab, LiveFormulasSettings, DEFAULT_SETTINGS } from './settings';

export default class LiveFormulasPlugin extends Plugin {
    settings: LiveFormulasSettings;

    async onload() {
        console.log('Loading Live Formulas Plugin (Settings Version)...');

        // 1. Load the settings
        await this.loadSettings();

        // 2. Add the settings tab to Obsidian's menu
        this.addSettingTab(new LiveFormulasSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor(
            'live-table',
            (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                
                let tableData: any = {};
                try {
                    tableData = source.trim() ? JSON.parse(source) : {};
                } catch (e) {
                    el.createEl('div', { text: "Error reading table data.", attr: { style: "color: red;" } });
                    return;
                }

                // PERFORMANCE FIX: Use app.vault.process to queue writes and prevent lag on large files
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

                // 3. Pass the settings down to the UI so it can use them!
                renderTableUI(el, tableData, this.settings, saveContent);
            }
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Unloading Live Formulas Plugin...');
    }
}