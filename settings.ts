import { App, PluginSettingTab, Setting } from 'obsidian';
import LiveFormulasPlugin from './main';

export interface LiveFormulasSettings {
    currencySymbol: string;
    enableHoverButtons: boolean;
    showToolbar: boolean;
    showHeaders: boolean;
}

export const DEFAULT_SETTINGS: LiveFormulasSettings = {
    currencySymbol: '$',
    enableHoverButtons: true,
    showToolbar: true,
    showHeaders: true,
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