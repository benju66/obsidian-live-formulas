import { App, PluginSettingTab, Setting } from 'obsidian';
import LiveFormulasPlugin from './main';

// 1. Define the shapes of our settings
export interface LiveFormulasSettings {
    currencySymbol: string;
    enableHoverButtons: boolean;
}

// 2. Set the default values for new users
export const DEFAULT_SETTINGS: LiveFormulasSettings = {
    currencySymbol: '$',
    enableHoverButtons: true
}

// 3. Build the visual menu tab
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
            .setDesc('Which symbol should be used when formatting formula outputs?')
            .addText(text => text
                .setPlaceholder('e.g. $ or €')
                .setValue(this.plugin.settings.currencySymbol)
                .onChange(async (value) => {
                    this.plugin.settings.currencySymbol = value || '$';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Hover Buttons')
            .setDesc('Show the floating + buttons to easily add rows and columns.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHoverButtons)
                .onChange(async (value) => {
                    this.plugin.settings.enableHoverButtons = value;
                    await this.plugin.saveSettings();
                }));
    }
}