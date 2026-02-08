/**
 * Kobo Highlights Importer - Main Plugin
 * 
 * An Obsidian plugin that imports highlights and annotations from a Kobo eReader's
 * SQLite database into Obsidian notes.
 */

import { App, Modal, Notice, Plugin, Setting, TFile, TFolder, Platform } from 'obsidian';
import {
    openDatabase,
    listDeviceContent,
    listDeviceBookmarks,
    buildContentIndex,
    countDeviceBookmarks,
    closeDatabase,
    getBookChapterData,
    type HighlightCounts,
    type BookChapterData
} from './kobo-db';
import {
    processHighlights,
    generateNewNote,
    appendHighlightsToNote,
    generateFilename,
    type BookWithHighlights
} from './highlight-processor';
import {
    KoboPluginSettings,
    DEFAULT_SETTINGS,
    KoboSettingTab
} from './settings';

// ============================================================================
// Main Plugin Class
// ============================================================================

export default class KoboHighlightsPlugin extends Plugin {
    settings: KoboPluginSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        // Add command to import highlights
        this.addCommand({
            id: 'import-kobo-highlights',
            name: 'Import Kobo highlights',
            callback: () => { void this.importHighlights(); },
        });

        // Add settings tab
        this.addSettingTab(new KoboSettingTab(this.app, this));
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Main import function - reads the Kobo database and creates notes
     */
    async importHighlights() {
        if (!this.settings.databasePath) {
            new Notice('Please set the database path in settings first.');
            return;
        }

        const modal = new ImportProgressModal(this.app, this);
        modal.open();

        try {
            await modal.runImport();
        } catch (error) {
            console.error('Import failed:', error);
            modal.showError(error instanceof Error ? error.message : 'Unknown error occurred');
        }
    }

    /**
     * Ensure the output folder exists
     */
    async ensureOutputFolder(): Promise<TFolder> {
        const folderPath = this.settings.outputFolder;

        let folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) {
            await this.app.vault.createFolder(folderPath);
            folder = this.app.vault.getAbstractFileByPath(folderPath);
        }

        if (!(folder instanceof TFolder)) {
            throw new Error(`${folderPath} exists but is not a folder`);
        }

        return folder;
    }

    /**
     * Create or update a note for a book with its highlights.
     * Returns the number of new highlights added.
     */
    async createOrUpdateBookNote(
        bookWithHighlights: BookWithHighlights,
        folder: TFolder,
        chapterData?: BookChapterData
    ): Promise<{ file: TFile; newHighlights: number; isNew: boolean }> {
        const filename = generateFilename(bookWithHighlights.book.title, this.settings) + '.md';
        const filePath = `${folder.path}/${filename}`;

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile && this.settings.appendToExisting) {
            // Append mode: read existing content and add new highlights
            const existingContent = await this.app.vault.read(existingFile);
            const { content, newHighlightsCount } = appendHighlightsToNote(
                existingContent,
                bookWithHighlights,
                this.settings,
                chapterData
            );

            if (newHighlightsCount > 0) {
                await this.app.vault.modify(existingFile, content);
            }

            return {
                file: existingFile,
                newHighlights: newHighlightsCount,
                isNew: false
            };
        } else if (existingFile instanceof TFile) {
            // Overwrite mode
            const content = generateNewNote(bookWithHighlights, this.settings, chapterData);
            await this.app.vault.modify(existingFile, content);
            return {
                file: existingFile,
                newHighlights: bookWithHighlights.highlights.length,
                isNew: false
            };
        } else {
            // Create new file
            const content = generateNewNote(bookWithHighlights, this.settings, chapterData);
            const file = await this.app.vault.create(filePath, content);
            return {
                file,
                newHighlights: bookWithHighlights.highlights.length,
                isNew: true
            };
        }
    }

    /**
     * Read a file from the filesystem using Node.js fs module
     */
    readDatabaseFile(filePath: string): ArrayBuffer {
        if (Platform.isDesktop) {
            const nodeFs = window.require('fs');
            const nodePath = window.require('path');

            const normalizedPath = nodePath.normalize(filePath);

            if (!nodeFs.existsSync(normalizedPath)) {
                throw new Error(`Database file not found: ${normalizedPath}`);
            }

            const buffer: Buffer = nodeFs.readFileSync(normalizedPath);
            return (buffer.buffer as ArrayBuffer).slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        } else {
            throw new Error('This plugin only works on desktop (not mobile).');
        }
    }
}

// ============================================================================
// Import Progress Modal
// ============================================================================

class ImportProgressModal extends Modal {
    private plugin: KoboHighlightsPlugin;
    private contentEl_: HTMLElement;
    private progressEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private statsEl: HTMLElement | null = null;

    constructor(app: App, plugin: KoboHighlightsPlugin) {
        super(app);
        this.plugin = plugin;
        this.contentEl_ = this.contentEl;
    }

    onOpen() {
        this.contentEl_.empty();
        this.contentEl_.addClass('kobo-import-modal');

        new Setting(this.contentEl_).setName('Importing Kobo highlights').setHeading();

        this.statusEl = this.contentEl_.createEl('p', {
            text: 'Initializing...',
            cls: 'kobo-import-status'
        });

        const progressContainer = this.contentEl_.createDiv({ cls: 'kobo-import-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
        this.progressEl = progressBar.createDiv({ cls: 'progress-bar-fill' });
        this.progressEl.setCssStyles({ width: '0%' });

        this.statsEl = this.contentEl_.createDiv({ cls: 'kobo-import-stats' });
    }

    setStatus(message: string) {
        if (this.statusEl) {
            this.statusEl.textContent = message;
        }
    }

    setProgress(percent: number) {
        if (this.progressEl) {
            this.progressEl.setCssStyles({ width: `${percent}%` });
        }
    }

    showError(message: string) {
        this.setStatus(`Error: ${message}`);
        if (this.progressEl) {
            this.progressEl.addClass('progress-error');
        }
    }

    showStats(
        _counts: HighlightCounts,
        booksProcessed: number,
        newBooks: number,
        newHighlights: number,
        skippedHighlights: number
    ) {
        if (!this.statsEl) return;

        this.statsEl.empty();

        const createStatCard = (value: number, label: string) => {
            const card = this.statsEl!.createDiv({ cls: 'kobo-stat-card' });
            card.createDiv({ text: value.toString(), cls: 'stat-value' });
            card.createDiv({ text: label, cls: 'stat-label' });
        };

        createStatCard(booksProcessed, 'Books Processed');
        createStatCard(newBooks, 'New Books');
        createStatCard(newHighlights, 'New Highlights');
        createStatCard(skippedHighlights, 'Already Imported');
    }

    async runImport() {
        // Step 1: Validate database path
        this.setStatus('Checking database file...');
        this.setProgress(10);

        const dbPath = this.plugin.settings.databasePath;

        // Verify file exists and read it
        const nodeFs = window.require('fs');
        const nodePath = window.require('path');
        const normalizedPath = nodePath.normalize(dbPath);

        if (!nodeFs.existsSync(normalizedPath)) {
            throw new Error(`Database file not found: ${normalizedPath}`);
        }

        // Read file to buffer
        this.setStatus('Reading database file...');
        this.setProgress(15);

        const fileBuffer: Buffer = nodeFs.readFileSync(normalizedPath);
        const arrayBuffer = (fileBuffer.buffer as ArrayBuffer).slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
        );

        // Step 2: Open database (WASM is inline, no external file needed)
        this.setStatus('Opening database...');
        this.setProgress(20);

        const db = await openDatabase(arrayBuffer);

        try {
            // Step 3: Count bookmarks
            this.setStatus('Counting highlights...');
            this.setProgress(30);

            const counts = countDeviceBookmarks(db);
            console.debug('Highlight counts:', counts);

            if (counts.total === 0) {
                throw new Error('No highlights found in the database.');
            }

            // Step 4: Load content (books)
            this.setStatus('Loading books...');
            this.setProgress(40);

            const content = listDeviceContent(db, this.plugin.settings.includeStoreBought);
            const contentIndex = buildContentIndex(content);
            console.debug('Loaded content:', content.length, 'books');

            // Step 5: Load bookmarks
            this.setStatus('Loading highlights...');
            this.setProgress(50);

            const bookmarks = listDeviceBookmarks(db, this.plugin.settings.includeStoreBought);
            console.debug('Loaded bookmarks:', bookmarks.length, 'highlights');

            // Step 6: Process highlights
            this.setStatus('Processing highlights...');
            this.setProgress(60);

            const booksWithHighlights = processHighlights(bookmarks, contentIndex);
            console.debug('Processed:', booksWithHighlights.length, 'books with highlights');

            // Step 7: Load chapter data for accurate position calculation
            this.setStatus('Loading chapter data...');
            this.setProgress(65);

            const allChapterData = getBookChapterData(db);
            console.debug('Loaded chapter data for', allChapterData.size, 'books');

            // Step 8: Ensure output folder exists
            this.setStatus('Creating output folder...');
            this.setProgress(70);

            const folder = await this.plugin.ensureOutputFolder();

            // Step 9: Create/update notes
            let totalNewHighlights = 0;
            let newBooks = 0;
            let totalHighlightsInDb = 0;
            const totalBooks = booksWithHighlights.length;

            for (let i = 0; i < booksWithHighlights.length; i++) {
                const bookWithHighlights = booksWithHighlights[i];
                const progress = 70 + ((i + 1) / totalBooks) * 25;

                this.setStatus(`Importing: ${bookWithHighlights.book.title}`);
                this.setProgress(progress);

                // Get chapter data for this specific book
                const bookChapterData = allChapterData.get(bookWithHighlights.book.contentId);

                const result = await this.plugin.createOrUpdateBookNote(bookWithHighlights, folder, bookChapterData);
                totalNewHighlights += result.newHighlights;
                totalHighlightsInDb += bookWithHighlights.highlights.length;
                if (result.isNew) newBooks++;
            }

            const skippedHighlights = totalHighlightsInDb - totalNewHighlights;

            // Step 9: Complete
            this.setStatus('Import complete!');
            this.setProgress(100);

            this.showStats(counts, totalBooks, newBooks, totalNewHighlights, skippedHighlights);

            if (totalNewHighlights > 0) {
                new Notice(`Imported ${totalNewHighlights} new highlights from ${totalBooks} books.`);
            } else {
                new Notice(`All highlights are already imported. No changes made.`);
            }

        } finally {
            closeDatabase(db);
        }
    }
}
