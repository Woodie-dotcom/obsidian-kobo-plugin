/**
 * Settings Module
 * 
 * Plugin settings management and settings tab UI with template configuration.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoboHighlightsPlugin from './main';
import { DEFAULT_TEMPLATES, renderTemplate, TemplateContext } from './template-engine';

// ============================================================================
// Settings Interface
// ============================================================================

export interface KoboPluginSettings {
    /** Path to the Kobo database file */
    databasePath: string;

    /** Output folder for imported notes (relative to vault root) */
    outputFolder: string;

    /** Whether to include store-bought books (not just sideloaded) */
    includeStoreBought: boolean;

    /** Whether to append to existing notes instead of overwriting */
    appendToExisting: boolean;

    // Template settings
    fileNameTemplate: string;
    frontmatterTemplate: string;
    pageMetadataTemplate: string;
    highlightTemplate: string;
    syncHeaderTemplate: string;
}

export const DEFAULT_SETTINGS: KoboPluginSettings = {
    databasePath: '',
    outputFolder: 'Kobo Highlights',
    includeStoreBought: true,
    appendToExisting: true,

    fileNameTemplate: DEFAULT_TEMPLATES.fileName,
    frontmatterTemplate: DEFAULT_TEMPLATES.frontmatter,
    pageMetadataTemplate: DEFAULT_TEMPLATES.pageMetadata,
    highlightTemplate: DEFAULT_TEMPLATES.highlight,
    syncHeaderTemplate: DEFAULT_TEMPLATES.syncHeader,
};

// ============================================================================
// Settings Tab
// ============================================================================

export class KoboSettingTab extends PluginSettingTab {
    plugin: KoboHighlightsPlugin;

    constructor(app: App, plugin: KoboHighlightsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Kobo Highlights Importer' });

        // ====================================================================
        // General Settings Section
        // ====================================================================
        containerEl.createEl('h2', { text: 'General Settings' });

        // Database path setting (manual entry only - Browse removed for electron compatibility)
        new Setting(containerEl)
            .setName('Database Path')
            .setDesc('Full path to your KoboReader.sqlite file. Connect your Kobo, navigate to the .kobo folder, and copy the full path.')
            .addText(text => text
                .setPlaceholder('C:\\Users\\...\\KoboReader.sqlite or /Volumes/KOBOeReader/.kobo/KoboReader.sqlite')
                .setValue(this.plugin.settings.databasePath)
                .onChange(async (value) => {
                    this.plugin.settings.databasePath = value;
                    await this.plugin.saveSettings();
                }));

        // Output folder setting
        new Setting(containerEl)
            .setName('Output Folder')
            .setDesc('Folder where imported highlight notes will be saved (relative to vault root).')
            .addText(text => text
                .setPlaceholder('Kobo Highlights')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Include store-bought books
        new Setting(containerEl)
            .setName('Include Store-Bought Books')
            .setDesc('Import highlights from books purchased from the Kobo store, not just sideloaded books.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeStoreBought)
                .onChange(async (value) => {
                    this.plugin.settings.includeStoreBought = value;
                    await this.plugin.saveSettings();
                }));

        // Append mode
        new Setting(containerEl)
            .setName('Append to Existing Notes')
            .setDesc('When enabled, new highlights are added to existing notes. When disabled, notes are overwritten.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.appendToExisting)
                .onChange(async (value) => {
                    this.plugin.settings.appendToExisting = value;
                    await this.plugin.saveSettings();
                }));

        // ====================================================================
        // Template Configuration Section
        // ====================================================================
        containerEl.createEl('h2', { text: 'Template Configuration' });

        // Help text
        const helpDiv = containerEl.createDiv({ cls: 'kobo-template-help' });
        helpDiv.createEl('p', {
            text: 'Customize how notes are generated using template variables.',
            cls: 'setting-item-description'
        });

        // Variables reference
        const variablesDiv = helpDiv.createEl('details');
        variablesDiv.createEl('summary', { text: 'Available Variables' });
        const variablesList = variablesDiv.createEl('div', { cls: 'kobo-variables-list' });
        variablesList.innerHTML = `
			<p><strong>Book Variables:</strong></p>
			<code>{{title}}</code> <code>{{author}}</code> <code>{{progress}}</code> <code>{{pages}}</code> <code>{{date_last_read}}</code> <code>{{highlights_count}}</code> <code>{{source}}</code> <code>{{date}}</code>
			<p><strong>Highlight Variables:</strong></p>
			<code>{{text}}</code> <code>{{annotation}}</code> <code>{{location}}</code> <code>{{date_created}}</code>
			<p><strong>Conditionals:</strong></p>
			<code>{% if annotation %}...{% endif %}</code>
			<p><strong>Date Formatting:</strong></p>
			<code>{{date|date('DD MMMM YYYY')}}</code>
		`;

        // File name template
        new Setting(containerEl)
            .setName('File Name')
            .setDesc('Template for the note file name (without .md extension).')
            .addText(text => text
                .setPlaceholder('{{title}}')
                .setValue(this.plugin.settings.fileNameTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.fileNameTemplate = value;
                    await this.plugin.saveSettings();
                }))
            .addExtraButton(button => button
                .setIcon('reset')
                .setTooltip('Reset to default')
                .onClick(async () => {
                    this.plugin.settings.fileNameTemplate = DEFAULT_TEMPLATES.fileName;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // Frontmatter template
        this.addTextAreaSetting(containerEl, {
            name: 'Frontmatter',
            desc: 'YAML frontmatter at the top of each note.',
            settingKey: 'frontmatterTemplate',
            defaultValue: DEFAULT_TEMPLATES.frontmatter,
            height: 200,
        });

        // Page metadata template
        this.addTextAreaSetting(containerEl, {
            name: 'Page Metadata',
            desc: 'Content shown after frontmatter (title, author info, etc.).',
            settingKey: 'pageMetadataTemplate',
            defaultValue: DEFAULT_TEMPLATES.pageMetadata,
            height: 150,
        });

        // Highlight template
        this.addTextAreaSetting(containerEl, {
            name: 'Highlight Format',
            desc: 'Template for each individual highlight.',
            settingKey: 'highlightTemplate',
            defaultValue: DEFAULT_TEMPLATES.highlight,
            height: 180,
        });

        // Sync header template
        this.addTextAreaSetting(containerEl, {
            name: 'New Highlights Header',
            desc: 'Header shown when new highlights are added to an existing note.',
            settingKey: 'syncHeaderTemplate',
            defaultValue: DEFAULT_TEMPLATES.syncHeader,
            height: 80,
        });

        // ====================================================================
        // Preview Section
        // ====================================================================
        containerEl.createEl('h2', { text: 'Template Preview' });

        const previewContainer = containerEl.createDiv({ cls: 'kobo-template-preview' });
        this.renderPreview(previewContainer);

        // ====================================================================
        // Instructions Section
        // ====================================================================
        containerEl.createEl('h2', { text: 'How to Use' });

        const instructions = containerEl.createEl('div', { cls: 'kobo-instructions' });
        instructions.createEl('ol', {}, (ol) => {
            ol.createEl('li', { text: 'Connect your Kobo device to your computer' });
            ol.createEl('li', { text: 'Copy the KoboReader.sqlite file from the .kobo folder on your device' });
            ol.createEl('li', { text: 'Set the database path above to point to the copied file' });
            ol.createEl('li', { text: 'Run the "Import Kobo Highlights" command from the command palette' });
        });
    }

    /**
     * Add a textarea setting with reset button
     */
    private addTextAreaSetting(
        containerEl: HTMLElement,
        options: {
            name: string;
            desc: string;
            settingKey: keyof KoboPluginSettings;
            defaultValue: string;
            height: number;
        }
    ): void {
        const setting = new Setting(containerEl)
            .setName(options.name)
            .setDesc(options.desc)
            .addExtraButton(button => button
                .setIcon('reset')
                .setTooltip('Reset to default')
                .onClick(async () => {
                    (this.plugin.settings[options.settingKey] as string) = options.defaultValue;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // Create textarea below the setting
        const textareaContainer = containerEl.createDiv({ cls: 'kobo-textarea-container' });
        const textarea = textareaContainer.createEl('textarea', {
            cls: 'kobo-template-textarea',
            attr: {
                rows: Math.ceil(options.height / 20).toString(),
                spellcheck: 'false',
            }
        });
        textarea.value = this.plugin.settings[options.settingKey] as string;
        textarea.style.width = '100%';
        textarea.style.height = `${options.height}px`;
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';

        textarea.addEventListener('change', async () => {
            (this.plugin.settings[options.settingKey] as string) = textarea.value;
            await this.plugin.saveSettings();
        });
    }

    /**
     * Render a preview of the templates with sample data
     */
    private renderPreview(container: HTMLElement): void {
        const sampleContext: TemplateContext = {
            title: 'How to Take Smart Notes',
            author: 'Sönke Ahrens',
            progress: 75,
            pages: 212,
            date_last_read: '2026-01-15T10:30:00',
            highlights_count: 15,
            source: 'kobo',
            date: new Date().toISOString(),
        };

        const sampleHighlight: TemplateContext = {
            ...sampleContext,
            text: 'This is a sample highlight from the book. It demonstrates how your highlights will look.',
            annotation: 'My note about this highlight',
            chapter_progress: 0.45,
            date_created: '2026-01-14T15:20:00',
            location: 45,  // 45% through the book
        };

        try {
            let preview = '';

            // Frontmatter
            preview += renderTemplate(this.plugin.settings.frontmatterTemplate, sampleContext);
            preview += '\n\n';

            // Page metadata
            preview += renderTemplate(this.plugin.settings.pageMetadataTemplate, sampleContext);
            preview += '\n\n';

            // Sample highlight
            preview += renderTemplate(this.plugin.settings.highlightTemplate, sampleHighlight);

            const pre = container.createEl('pre', { cls: 'kobo-preview-content' });
            pre.style.padding = '1em';
            pre.style.backgroundColor = 'var(--background-secondary)';
            pre.style.borderRadius = '8px';
            pre.style.overflow = 'auto';
            pre.style.maxHeight = '400px';
            pre.style.fontSize = '12px';
            pre.textContent = preview;
        } catch (error) {
            container.createEl('p', {
                text: `Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cls: 'kobo-preview-error'
            });
        }
    }
}
