/**
 * Template Engine Module
 * 
 * Simple Jinja-like template engine for customizable note generation.
 * Supports variable substitution, conditionals, and date formatting.
 */

// ============================================================================
// Types
// ============================================================================

export interface TemplateContext {
    // Book variables
    title?: string;
    author?: string;
    progress?: number;
    pages?: number | null;
    date_last_read?: string | null;
    highlights_count?: number;
    source?: string;
    date?: string;
    content_id?: string;

    // Highlight variables (when rendering individual highlights)
    text?: string;
    annotation?: string;
    chapter_progress?: number;
    date_created?: string;
    bookmark_id?: string;
    location?: number;  // Position in book as percentage (0-100)
}

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Format a date string using a simple format pattern
 * Supported tokens: YYYY, MM, DD, HH, mm, ss, MMMM (month name), dddd (day name)
 */
export function formatDate(dateStr: string | null | undefined, format: string): string {
    if (!dateStr) return '';

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const monthsIt = [
            'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
            'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
        ];

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const pad = (n: number) => n.toString().padStart(2, '0');

        // IMPORTANT: Replace longer tokens first to avoid partial matches
        // e.g., MMMM must be replaced before MM, otherwise MM gets replaced first
        return format
            .replace('YYYY', date.getFullYear().toString())
            .replace('MMMM', monthsIt[date.getMonth()])  // Full month name (Italian)
            .replace('MMM', months[date.getMonth()].substring(0, 3))  // Short month name
            .replace('MM', pad(date.getMonth() + 1))  // Numeric month
            .replace('dddd', days[date.getDay()])  // Full day name
            .replace('DD', pad(date.getDate()))
            .replace('HH', pad(date.getHours()))
            .replace('mm', pad(date.getMinutes()))
            .replace('ss', pad(date.getSeconds()));
    } catch {
        return dateStr || '';
    }
}

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Render a template string with the given context.
 * 
 * Supports:
 * - Variable substitution: {{variable}}
 * - Date filter: {{variable|date('FORMAT')}}
 * - Conditionals: {% if variable %}content{% endif %}
 * - Negated conditionals: {% if not variable %}content{% endif %}
 */
export function renderTemplate(template: string, context: TemplateContext): string {
    let result = template;

    // Process conditionals first: {% if variable %}...{% endif %}
    result = processConditionals(result, context);

    // Process variables with filters: {{variable|filter}}
    result = result.replace(/\{\{(\w+)\|date\('([^']+)'\)\}\}/g, (_, varName, format) => {
        const value = context[varName as keyof TemplateContext];
        if (value === undefined || value === null) return '';
        return formatDate(String(value), format);
    });

    // Process simple variables: {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
        const value = context[varName as keyof TemplateContext];
        if (value === undefined || value === null) return '';
        return String(value);
    });

    return result;
}

/**
 * Process conditional blocks in template
 */
function processConditionals(template: string, context: TemplateContext): string {
    let result = template;

    // Match {% if variable %}...{% endif %} (non-greedy, handles nested)
    // Also handles {% if not variable %}
    const conditionalRegex = /\{%\s*if\s+(not\s+)?(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;

    result = result.replace(conditionalRegex, (_, negated, varName, content) => {
        const value = context[varName as keyof TemplateContext];
        const hasValue = value !== undefined && value !== null && value !== '' && value !== 0;
        const shouldShow = negated ? !hasValue : hasValue;
        return shouldShow ? content : '';
    });

    return result;
}

// ============================================================================
// Default Templates
// ============================================================================

export const DEFAULT_TEMPLATES = {
    fileName: '{{title}}',

    frontmatter: `---
title: "{{title}}"
author: "{{author}}"
progress: {{progress}}
{% if pages %}pages: {{pages}}
{% endif %}last_read: "{{date_last_read}}"
source: kobo
imported: "{{date}}"
---`,

    pageMetadata: `# {{title}}

**Author:** {{author}}
{% if progress %}**Progress:** {{progress}}%{% endif %}

## Highlights`,

    highlight: `> {{text}}

{% if annotation %}**Note:** {{annotation}}

{% endif %}*— {{date_created|date('DD MMMM YYYY')}}{% if location %} · {{location}}%{% endif %}*

---`,

    // Header shown when new highlights are added during a sync
    syncHeader: `
## New Highlights ({{date|date('DD MMMM YYYY')}})`,
};
