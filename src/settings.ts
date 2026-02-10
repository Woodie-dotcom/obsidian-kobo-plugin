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

        new Setting(containerEl).setName('Kobo highlights importer').setHeading();

        // ====================================================================
        // Core Options
        // ====================================================================

        // Database path setting (manual entry only - Browse removed for electron compatibility)
        new Setting(containerEl)
            .setName('Database path')
            .setDesc('Full path to your KoboReader.sqlite file, found in the .kobo folder on your device.')
            .addText(text => text
                .setPlaceholder('C:\\Users\\...\\KoboReader.sqlite or /Volumes/KOBOeReader/.kobo/KoboReader.sqlite')
                .setValue(this.plugin.settings.databasePath)
                .onChange(async (value) => {
                    this.plugin.settings.databasePath = value;
                    await this.plugin.saveSettings();
                }));
        // Output folder setting
        new Setting(containerEl)
            .setName('Output folder')
            .setDesc('Folder where imported highlight notes will be saved (relative to vault root).')
            .addText(text => text
                .setPlaceholder('Kobo highlights')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                }));
        // Include store-bought books
        new Setting(containerEl)
            .setName('Include store-bought books')
            .setDesc('Also import highlights from store-purchased books, not just sideloaded ones.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeStoreBought)
                .onChange(async (value) => {
                    this.plugin.settings.includeStoreBought = value;
                    await this.plugin.saveSettings();
                }));
        // Append mode
        new Setting(containerEl)
            .setName('Append to existing notes')
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
        new Setting(containerEl).setName('Template configuration').setHeading();

        // Help text
        const helpDiv = containerEl.createDiv({ cls: 'kobo-template-help' });
        helpDiv.createEl('p', {
            text: 'Customize how notes are generated using template variables.',
            cls: 'setting-item-description'
        });

        // Variables reference
        const variablesDiv = helpDiv.createEl('details');
        variablesDiv.createEl('summary', { text: 'Available variables' });
        const variablesList = variablesDiv.createEl('div', { cls: 'kobo-variables-list' });

        // Build variables list using DOM API instead of innerHTML
        const bookVarsP = variablesList.createEl('p');
        bookVarsP.createEl('strong', { text: 'Book variables:' });
        const bookCodes = ['{{title}}', '{{author}}', '{{progress}}', '{{pages}}', '{{date_last_read}}', '{{highlights_count}}', '{{source}}', '{{date}}'];
        bookCodes.forEach(code => variablesList.createEl('code', { text: code }));

        const hlVarsP = variablesList.createEl('p');
        hlVarsP.createEl('strong', { text: 'Highlight variables:' });
        const hlCodes = ['{{text}}', '{{annotation}}', '{{location}}', '{{date_created}}'];
        hlCodes.forEach(code => variablesList.createEl('code', { text: code }));

        const condP = variablesList.createEl('p');
        condP.createEl('strong', { text: 'Conditionals:' });
        variablesList.createEl('code', { text: '{% if annotation %}...{% endif %}' });

        const dateP = variablesList.createEl('p');
        dateP.createEl('strong', { text: 'Date formatting:' });
        variablesList.createEl('code', { text: "{{date|date('DD MMMM YYYY')}}" });

        // File name template
        new Setting(containerEl)
            .setName('File name')
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
            name: 'Page metadata',
            desc: 'Content shown after frontmatter (title, author info, etc.).',
            settingKey: 'pageMetadataTemplate',
            defaultValue: DEFAULT_TEMPLATES.pageMetadata,
            height: 150,
        });

        // Highlight template
        this.addTextAreaSetting(containerEl, {
            name: 'Highlight format',
            desc: 'Template for each individual highlight.',
            settingKey: 'highlightTemplate',
            defaultValue: DEFAULT_TEMPLATES.highlight,
            height: 180,
        });

        // Sync header template
        this.addTextAreaSetting(containerEl, {
            name: 'New highlights header',
            desc: 'Header shown when new highlights are added to an existing note.',
            settingKey: 'syncHeaderTemplate',
            defaultValue: DEFAULT_TEMPLATES.syncHeader,
            height: 80,
        });
        // ====================================================================
        // Preview Section
        // ====================================================================
        new Setting(containerEl).setName('Template preview').setHeading();

        const previewContainer = containerEl.createDiv({ cls: 'kobo-template-preview' });
        this.renderPreview(previewContainer);

        // ====================================================================
        // Instructions Section
        // ====================================================================
        new Setting(containerEl).setName('How to use').setHeading();

        const instructions = containerEl.createEl('div', { cls: 'kobo-instructions' });
        instructions.createEl('ol', {}, (ol) => {
            ol.createEl('li', { text: 'Connect your device to your computer' });
            const li2 = ol.createEl('li');
            li2.appendText('Set the database path above to either:');
            const subList = li2.createEl('ul');
            subList.createEl('li', { text: 'Direct path on device (e.g., E:\\.kobo\\KoboReader.sqlite on Windows)' });
            subList.createEl('li', { text: 'Path to a local copy of the file' });
            ol.createEl('li', { text: 'Run the "Import highlights" command from the command palette' });
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
        new Setting(containerEl)
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
        textarea.setCssStyles({ height: `${options.height}px` });

        textarea.addEventListener('change', () => {
            (this.plugin.settings[options.settingKey] as string) = textarea.value;
            void this.plugin.saveSettings();
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
            pre.textContent = preview;
        } catch (error) {
            container.createEl('p', {
                text: `Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cls: 'kobo-preview-error'
            });
        }
    }
}
