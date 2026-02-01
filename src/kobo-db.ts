/**
 * Kobo Database Module
 * 
 * TypeScript interfaces and query functions for interacting with Kobo's SQLite database.
 * Uses sql.js with proper WASM loading for Obsidian/Electron.
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

// ============================================================================
// Interfaces 
// ============================================================================

/**
 * Represents a book/content item from the Kobo Content table.
 */
export interface KoboContent {
    ContentID: string;
    ContentType: string;
    MimeType: string | null;
    BookTitle: string | null;
    Title: string | null;
    Attribution: string | null;
    Description: string | null;
    DateCreated: string | null;
    Publisher: string | null;
    DateLastRead: string | null;
    VolumeIndex: number;
    NumPages: number | null;
    ReadStatus: number;
    PercentRead: string | null;
    ISBN: string | null;
    Series: string | null;
    SeriesNumber: string | null;
    TimeSpentReading: number | null;
}

/**
 * Represents a bookmark/highlight from the Kobo Bookmark table.
 */
export interface KoboBookmark {
    BookmarkID: string;
    VolumeID: string;
    ContentID: string | null;
    Text: string | null;
    Annotation: string | null;
    DateCreated: string | null;
    DateModified: string | null;
    ChapterProgress: number;
    Hidden: string | null;
    Type: string | null;
}

/**
 * Statistics about highlights on the device
 */
export interface HighlightCounts {
    total: number;
    sideloaded: number;
    official: number;
}

/**
 * Chapter information for calculating book position
 */
export interface ChapterInfo {
    ContentID: string;
    VolumeIndex: number;
}

/**
 * Chapter count for a book (used for position calculation)
 */
export interface BookChapterData {
    totalChapters: number;
}

// ============================================================================
// Database Connection
// ============================================================================

let SQL: SqlJsStatic | null = null;

/**
 * Initialize sql.js with WASM from CDN
 */
async function initSQL(): Promise<SqlJsStatic> {
    if (SQL) return SQL;

    SQL = await initSqlJs({
        // Use the CDN-hosted WASM file
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });

    return SQL;
}

/**
 * Open a Kobo database from a file buffer
 */
export async function openDatabase(buffer: ArrayBuffer): Promise<Database> {
    const sql = await initSQL();
    return new sql.Database(new Uint8Array(buffer));
}

// ============================================================================
// Query Functions (converted from October's GORM queries)
// ============================================================================

/**
 * Helper to execute a query and return results as objects
 */
function queryToObjects<T>(db: Database, sql: string): T[] {
    const results = db.exec(sql);
    if (results.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj as T;
    });
}

/**
 * List all books/content from the device.
 */
export function listDeviceContent(db: Database, includeStoreBought: boolean): KoboContent[] {
    let query = `
		SELECT 
			ContentID,
			ContentType,
			MimeType,
			BookTitle,
			Title,
			Attribution,
			Description,
			DateCreated,
			Publisher,
			DateLastRead,
			VolumeIndex,
			"___NumPages" as NumPages,
			ReadStatus,
			"___PercentRead" as PercentRead,
			ISBN,
			Series,
			SeriesNumber,
			TimeSpentReading
		FROM Content 
		WHERE ContentType = '6' AND VolumeIndex = -1
	`;

    if (!includeStoreBought) {
        query += ` AND ContentID LIKE '%file:///%'`;
    }

    query += ` ORDER BY "___PercentRead" DESC, Title ASC`;

    return queryToObjects<KoboContent>(db, query);
}

/**
 * List all bookmarks/highlights from the device.
 */
export function listDeviceBookmarks(db: Database, includeStoreBought: boolean): KoboBookmark[] {
    let query = `
		SELECT 
			BookmarkID,
			VolumeID,
			ContentID,
			Text,
			Annotation,
			DateCreated,
			DateModified,
			ChapterProgress,
			Hidden,
			Type
		FROM Bookmark
	`;

    if (!includeStoreBought) {
        query += ` WHERE VolumeID LIKE '%file:///%'`;
    }

    query += ` ORDER BY VolumeID ASC, ChapterProgress ASC`;

    return queryToObjects<KoboBookmark>(db, query);
}

/**
 * Build an index of content by ContentID for quick lookup.
 */
export function buildContentIndex(content: KoboContent[]): Map<string, KoboContent> {
    const index = new Map<string, KoboContent>();
    for (const item of content) {
        index.set(item.ContentID, item);
    }
    return index;
}

/**
 * Get chapter count for all books (for calculating accurate book position).
 * Returns a map from BookID to chapter count.
 */
export function getBookChapterData(db: Database): Map<string, BookChapterData> {
    // Get max VolumeIndex for each book
    // Chapter ContentID format: "file:///path/to/book.epub#(N)..."
    // We extract the book ID (before #) and find the max chapter index
    const query = `
        SELECT 
            ContentID,
            VolumeIndex
        FROM Content 
        WHERE ContentType = '9'
    `;

    const chapters = queryToObjects<ChapterInfo>(db, query);
    const bookChapters = new Map<string, BookChapterData>();

    for (const chapter of chapters) {
        // Extract book ID from chapter ContentID
        const bookId = extractBookIdFromChapterId(chapter.ContentID);

        if (!bookChapters.has(bookId)) {
            bookChapters.set(bookId, { totalChapters: 0 });
        }

        const bookData = bookChapters.get(bookId)!;
        bookData.totalChapters = Math.max(bookData.totalChapters, chapter.VolumeIndex + 1);
    }

    return bookChapters;
}

/**
 * Extract the book ID from a chapter's ContentID.
 * Chapter ContentIDs contain the book path plus chapter-specific suffix.
 */
function extractBookIdFromChapterId(chapterId: string): string {
    // Common patterns:
    // file:///mnt/onboard/book.epub#(1)!path -> book ID is before #
    // file:///mnt/onboard/book.epub!!OEBPS/chapter1.xhtml -> book ID is before !!

    // Find the separator
    const hashIndex = chapterId.indexOf('#');
    const doubleExclamIndex = chapterId.indexOf('!!');

    let separatorIndex = -1;
    if (hashIndex !== -1 && doubleExclamIndex !== -1) {
        separatorIndex = Math.min(hashIndex, doubleExclamIndex);
    } else if (hashIndex !== -1) {
        separatorIndex = hashIndex;
    } else if (doubleExclamIndex !== -1) {
        separatorIndex = doubleExclamIndex;
    }

    if (separatorIndex !== -1) {
        return chapterId.substring(0, separatorIndex);
    }

    // Fallback: return as-is
    return chapterId;
}

/**
 * Count bookmarks on the device.
 */
export function countDeviceBookmarks(db: Database): HighlightCounts {
    const getCount = (sql: string): number => {
        const results = db.exec(sql);
        if (results.length === 0) return 0;
        return results[0].values[0][0] as number;
    };

    return {
        total: getCount('SELECT COUNT(*) FROM Bookmark'),
        sideloaded: getCount("SELECT COUNT(*) FROM Bookmark WHERE VolumeID LIKE '%file:///%'"),
        official: getCount("SELECT COUNT(*) FROM Bookmark WHERE VolumeID NOT LIKE '%file:///%'"),
    };
}

/**
 * Close the database connection
 */
export function closeDatabase(db: Database): void {
    db.close();
}
