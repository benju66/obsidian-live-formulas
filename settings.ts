import { App, PluginSettingTab, Setting } from 'obsidian';
import LiveFormulasPlugin from './main';

export interface LiveFormulasSettings {
    currencySymbol: string;
    /** When true, negative currency displays as (1,000) instead of -1,000 */
    accountingNegatives: boolean;
    enableHoverButtons: boolean;
    showToolbar: boolean;
    /** When `showToolbar` is true, whether the ribbon is visible (can be collapsed in the UI). */
    toolbarVisible: boolean;
    showHeaders: boolean;
    showStatusBar: boolean;
    showTableNames: boolean;
    defaultRows: number;
    defaultCols: number;
}

export const DEFAULT_SETTINGS: LiveFormulasSettings = {
    currencySymbol: '$',
    accountingNegatives: false,
    enableHoverButtons: true,
    showToolbar: true,
    toolbarVisible: true,
    showHeaders: true,
    showStatusBar: true,
    showTableNames: true,
    defaultRows: 2,
    defaultCols: 2,
};

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
            .setName('Accounting Negatives')
            .setDesc('Format negative currency as (1,000) instead of -1,000')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.accountingNegatives)
                .onChange(async (value) => {
                    this.plugin.settings.accountingNegatives = value;
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
                        if (value.trim() === '') {
                            this.plugin.settings.defaultRows = 2;
                            await this.plugin.saveSettings();
                            return;
                        }
                        let parsed = parseInt(value, 10);
                        if (!isNaN(parsed)) {
                            if (parsed < 1) parsed = 1;
                            if (parsed > 50) parsed = 50;
                            this.plugin.settings.defaultRows = parsed;
                            await this.plugin.saveSettings();
                        }
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
                        if (value.trim() === '') {
                            this.plugin.settings.defaultCols = 2;
                            await this.plugin.saveSettings();
                            return;
                        }
                        let parsed = parseInt(value, 10);
                        if (!isNaN(parsed)) {
                            if (parsed < 1) parsed = 1;
                            if (parsed > 50) parsed = 50;
                            this.plugin.settings.defaultCols = parsed;
                            await this.plugin.saveSettings();
                        }
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

        new Setting(containerEl)
            .setName('Show Status Bar')
            .setDesc('Show the Excel-style status bar (Average, Count, Sum) at the bottom of the table.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showStatusBar !== false)
                .onChange(async (value) => {
                    this.plugin.settings.showStatusBar = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Table Names')
            .setDesc('Display a title input above the table to name your spreadsheets.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTableNames !== false)
                .onChange(async (value) => {
                    this.plugin.settings.showTableNames = value;
                    await this.plugin.saveSettings();
                }));
    }
}