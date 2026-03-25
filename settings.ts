import { App, PluginSettingTab, Setting } from 'obsidian';
import LiveFormulasPlugin from './main';

export interface LiveFormulasSettings {
    currencySymbol: string;
    enableHoverButtons: boolean;
    showToolbar: boolean;
    /** When `showToolbar` is true, whether the ribbon is visible (can be collapsed in the UI). */
    toolbarVisible: boolean;
    showHeaders: boolean;
    defaultRows: number;
    defaultCols: number;
}

export const DEFAULT_SETTINGS: LiveFormulasSettings = {
    currencySymbol: '$',
    enableHoverButtons: true,
    showToolbar: true,
    toolbarVisible: true,
    showHeaders: true,
    defaultRows: 2,
    defaultCols: 2,
}

export class LiveFormulasSettingTab extends PluginSettingTab {
    plugin: LiveFormulasPlugin;

    constructor(app: App, plugin: LiveFormulasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        containerEl.createEl('h2', {text: 'Live Table Formulas Settings'});

        new Setting(containerEl)
            .setName('Currency Symbol')
            .addText(text => text
                .setValue(this.plugin.settings.currencySymbol)
                .onChange(async (value) => {
                    this.plugin.settings.currencySymbol = value || '$';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Hover Buttons')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHoverButtons)
                .onChange(async (value) => {
                    this.plugin.settings.enableHoverButtons = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Formatting Toolbar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showToolbar)
                .onChange(async (value) => {
                    this.plugin.settings.showToolbar = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default table rows')
            .setDesc('Used when inserting a new live table (1–50).')
            .addText((text) =>
                text
                    .setPlaceholder('2')
                    .setValue(String(this.plugin.settings.defaultRows))
                    .onChange(async (value) => {
                        const n = parseInt(value.replace(/\D/g, ''), 10);
                        const clamped = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 2;
                        this.plugin.settings.defaultRows = clamped;
                        text.setValue(String(clamped));
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Default table columns')
            .setDesc('Used when inserting a new live table (1–50).')
            .addText((text) =>
                text
                    .setPlaceholder('2')
                    .setValue(String(this.plugin.settings.defaultCols))
                    .onChange(async (value) => {
                        const n = parseInt(value.replace(/\D/g, ''), 10);
                        const clamped = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 2;
                        this.plugin.settings.defaultCols = clamped;
                        text.setValue(String(clamped));
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show Row/Column Headers')
            .setDesc('Displays A, B, C and 1, 2, 3 labels.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showHeaders)
                .onChange(async (value) => {
                    this.plugin.settings.showHeaders = value;
                    await this.plugin.saveSettings();
                }));
    }
}