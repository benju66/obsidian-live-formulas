import { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import { renderTableUI } from './ui';

export default class LiveFormulasPlugin extends Plugin {
    async onload() {
        console.log('Loading Live Formulas Plugin (Modular Version)...');

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

                // The background saver logic stays here so it can use Obsidian's "app.workspace" tools
                const saveContent = async (newData: any) => {
                    const section = ctx.getSectionInfo(el);
                    if (!section) return; 
                    const file = this.app.workspace.getActiveFile();
                    if (!file) return;

                    const content = await this.app.vault.read(file);
                    const lines = content.split('\n');
                    const newJson = JSON.stringify(newData, null, 2);
                    lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, newJson);
                    await this.app.vault.modify(file, lines.join('\n'));
                };

                // Pass everything over to our UI module to draw the table!
                renderTableUI(el, tableData, saveContent);
            }
        );
    }

    onunload() {
        console.log('Unloading Live Formulas Plugin...');
    }
}