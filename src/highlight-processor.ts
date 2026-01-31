/**
 * Highlight Processor Module
 * 
 * Processes Kobo bookmarks/highlights and generates Markdown notes using templates.
 * Supports append mode to add new highlights to existing notes.
 * 
 * Duplicate detection uses text content matching instead of visible ID markers.
 */

import { KoboBookmark, KoboContent, BookChapterData } from './kobo-db';
import { renderTemplate, TemplateContext } from './template-engine';
import { KoboPluginSettings } from './settings';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A processed highlight ready for export to Markdown
 */
export interface ProcessedHighlight {
    bookmarkId: string;
    text: string;
    annotation: string;
    createdAt: Date;
    chapterProgress: number;
    chapterContentId: string | null;  // For calculating book position
}

/**
 * A book with its associated highlights
 */
export interface BookWithHighlights {
    book: {
        title: string;
        author: string;
        contentId: string;
        percentRead: number;
        numPages: number | null;
        dateLastRead: string | null;
    };
    highlights: ProcessedHighlight[];
}

// ============================================================================
// Text Processing
// ============================================================================

/**
 * Normalize highlight text by trimming, removing tabs, and collapsing multiple spaces.
 * Preserves newlines for readability.
 */
export function normalizeText(text: string): string {
    if (!text) return '';
    return text
        .trim()
        .replace(/\t/g, ' ')           // Replace tabs with spaces
        .replace(/[ ]{2,}/g, ' ');     // Collapse multiple spaces (but not newlines)
}

/**
 * Extract title from a file path when no book title is available.
 */
export function extractTitleFromPath(volumeId: string): string {
    try {
        const url = new URL(volumeId);
        const path = url.pathname;
        const filename = path.split('/').pop() || 'Unknown';
        return filename.replace(/\.(epub|kepub|pdf|mobi)$/i, '');
    } catch {
        const parts = volumeId.split('/');
        const filename = parts[parts.length - 1] || 'Unknown';
        return filename.replace(/\.(epub|kepub|pdf|mobi)$/i, '');
    }
}

/**
 * Parse a Kobo date string to a JavaScript Date object.
 */
export function parseKoboDate(dateStr: string | null): Date {
    if (!dateStr) {
        return new Date();
    }

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return new Date();
        }
        return date;
    } catch {
        return new Date();
    }
}

/**
 * Create a simple hash of text for duplicate detection
 */
function hashText(text: string): string {
    // Simple hash: first 50 chars + length
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const prefix = normalized.substring(0, 50);
    return `${prefix.length > 0 ? prefix : 'empty'}_${normalized.length}`;
}

// ============================================================================
// Highlight Processing
// ============================================================================

/**
 * Process bookmarks and organize them by book.
 */
export function processHighlights(
    bookmarks: KoboBookmark[],
    contentIndex: Map<string, KoboContent>
): BookWithHighlights[] {
    const bookMap = new Map<string, { book: KoboContent | null; highlights: ProcessedHighlight[] }>();

    for (const bookmark of bookmarks) {
        const text = normalizeText(bookmark.Text || '');
        const annotation = bookmark.Annotation || '';

        if (!text && !annotation) {
            continue;
        }

        if (!bookMap.has(bookmark.VolumeID)) {
            const content = contentIndex.get(bookmark.VolumeID) || null;
            bookMap.set(bookmark.VolumeID, { book: content, highlights: [] });
        }

        const bookEntry = bookMap.get(bookmark.VolumeID)!;

        bookEntry.highlights.push({
            bookmarkId: bookmark.BookmarkID,
            text: text || 'Placeholder for attached annotation',
            annotation: annotation,
            createdAt: parseKoboDate(bookmark.DateCreated || bookmark.DateModified),
            chapterProgress: bookmark.ChapterProgress,
            chapterContentId: bookmark.ContentID,  // For book position calculation
        });
    }

    const result: BookWithHighlights[] = [];

    for (const [volumeId, entry] of bookMap) {
        let title = entry.book?.Title || entry.book?.BookTitle || '';
        const author = entry.book?.Attribution || 'Unknown Author';

        if (!title) {
            title = extractTitleFromPath(volumeId);
        }

        result.push({
            book: {
                title: title,
                author: author,
                contentId: volumeId,
                // PercentRead is stored as decimal (0.27) or whole number (27) depending on Kobo version
                // If > 1, it's already a percentage; if <= 1, multiply by 100
                percentRead: (() => {
                    const raw = parseFloat(entry.book?.PercentRead || '0');
                    return raw > 1 ? raw : raw * 100;
                })(),
                numPages: entry.book?.NumPages || null,
                dateLastRead: entry.book?.DateLastRead || null,
            },
            highlights: entry.highlights,
        });
    }

    result.sort((a, b) => a.book.title.localeCompare(b.book.title));

    return result;
}

// ============================================================================
// Template-based Markdown Generation
// ============================================================================

/**
 * Create book context for template rendering
 */
function createBookContext(book: BookWithHighlights['book'], highlightCount: number): TemplateContext {
    return {
        title: book.title,
        author: book.author,
        progress: Math.round(book.percentRead),
        pages: book.numPages,
        date_last_read: book.dateLastRead,
        highlights_count: highlightCount,
        source: 'kobo',
        date: new Date().toISOString(),
        content_id: book.contentId,
    };
}

/**
 * Extract chapter index from a bookmark's ContentID.
 * Kobo stores the chapter index in the format #(N) within the ContentID.
 * Example: file:///path/book.epub#(5)OEBPS/Text/chapter.xhtml -> 5
 */
function extractChapterIndex(contentId: string | null): number | null {
    if (!contentId) return null;

    const match = contentId.match(/#\((\d+)\)/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

/**
 * Create highlight context for template rendering.
 * Calculates accurate book position using chapter index extracted from ContentID.
 * Returns null for location if we can't calculate it accurately.
 */
function createHighlightContext(
    highlight: ProcessedHighlight,
    bookContext: TemplateContext,
    chapterData?: BookChapterData
): TemplateContext {
    // Calculate location based on chapter position in book
    // Only calculate if we have both chapter index AND total chapters
    let locationPercent: number | undefined;

    // Extract chapter index directly from bookmark's ContentID
    const chapterIndex = extractChapterIndex(highlight.chapterContentId);

    if (chapterIndex !== null && chapterData && chapterData.totalChapters > 0) {
        // We have clean data - calculate global position
        locationPercent = Math.round(((chapterIndex + highlight.chapterProgress) / chapterData.totalChapters) * 100);
    }
    // Otherwise leave locationPercent undefined - don't show misleading data

    return {
        ...bookContext,
        text: highlight.text,
        annotation: highlight.annotation,
        chapter_progress: highlight.chapterProgress,
        date_created: highlight.createdAt.toISOString(),
        bookmark_id: highlight.bookmarkId,
        location: locationPercent,  // undefined if can't calculate accurately
    };
}

/**
 * Generate a new markdown note for a book with all its highlights.
 */
export function generateNewNote(
    bookWithHighlights: BookWithHighlights,
    settings: KoboPluginSettings,
    chapterData?: BookChapterData
): string {
    const { book, highlights } = bookWithHighlights;
    const bookContext = createBookContext(book, highlights.length);

    const sections: string[] = [];

    // Frontmatter
    sections.push(renderTemplate(settings.frontmatterTemplate, bookContext));
    sections.push('');

    // Page metadata
    sections.push(renderTemplate(settings.pageMetadataTemplate, bookContext));
    sections.push('');

    // Highlights (no markers - clean output)
    for (const highlight of highlights) {
        const highlightContext = createHighlightContext(highlight, bookContext, chapterData);
        sections.push(renderTemplate(settings.highlightTemplate, highlightContext));
    }

    return sections.join('\n');
}

/**
 * Extract existing highlight texts from a note for duplicate detection
 */
function extractExistingHighlights(content: string): Set<string> {
    const highlights = new Set<string>();

    // Match blockquotes: > text
    const quoteRegex = /^>\s*(.+)$/gm;
    let match;

    while ((match = quoteRegex.exec(content)) !== null) {
        const text = match[1].trim();
        if (text.length > 10) { // Skip very short matches
            highlights.add(hashText(text));
        }
    }

    return highlights;
}

/**
 * Append new highlights to an existing note.
 * Returns the updated content and count of new highlights added.
 */
export function appendHighlightsToNote(
    existingContent: string,
    bookWithHighlights: BookWithHighlights,
    settings: KoboPluginSettings,
    chapterData?: BookChapterData
): { content: string; newHighlightsCount: number } {
    const { book, highlights } = bookWithHighlights;

    // Extract already existing highlight texts
    const existingHashes = extractExistingHighlights(existingContent);

    // Filter to only new highlights (not already in the note)
    const newHighlights = highlights.filter(h => !existingHashes.has(hashText(h.text)));

    if (newHighlights.length === 0) {
        return { content: existingContent, newHighlightsCount: 0 };
    }

    const bookContext = createBookContext(book, highlights.length);

    // Build new highlights section
    const newSections: string[] = [];

    // Add sync header
    newSections.push('');
    newSections.push(renderTemplate(settings.syncHeaderTemplate, bookContext));
    newSections.push('');

    // Add new highlights (clean, no markers)
    for (const highlight of newHighlights) {
        const highlightContext = createHighlightContext(highlight, bookContext, chapterData);
        newSections.push(renderTemplate(settings.highlightTemplate, highlightContext));
    }

    // Append to end of file
    const result = existingContent + newSections.join('\n');

    return { content: result, newHighlightsCount: newHighlights.length };
}

/**
 * Generate a safe filename from a book title using template
 */
export function generateFilename(title: string, settings: KoboPluginSettings): string {
    const context: TemplateContext = { title };
    let filename = renderTemplate(settings.fileNameTemplate, context);

    // Sanitize filename
    filename = filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);

    return filename;
}
