# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-02-08

### Fixed
- **Code Review Compliance**: Addressed all Obsidian Community Plugin automated scan feedback
  - Replaced `SqlJsStatic` type with derived type definition
  - Replaced `console.log` with `console.debug` for development logging
  - Removed `innerHTML` usage in favor of DOM API methods
  - Replaced inline styles with CSS classes and `setCssStyles()`
  - Replaced HTML headings (`<h1>`, `<h2>`) with `Setting().setHeading()`
  - Applied sentence case to all UI text
  - Fixed async method without await
  - Fixed promise void in command callback
  - Removed unused variables

### Changed
- **Documentation**: Updated README and settings instructions
  - Clarified that both direct device access and local file copy work
  - Updated plugin name references to "Kobo Smart Importer"
  - Updated installation folder path

### Added
- Type declarations for sql.js (`sql-js.d.ts`)
- Code review verification tests in test suite

## [1.0.1] - 2026-02-07

### Added
- Renamed plugin to **Kobo Smart Importer** (id: `kobo-smart-importer`).
- Updated manifest to comply with Obsidian Community Plugins requirements.

## [1.0.0] - 2026-02-02

### Added
- Initial release
- Import highlights and annotations from Kobo SQLite database
- Customizable Jinja-like templates for note generation
- Incremental import with duplicate detection
- Support for both sideloaded and store-bought books
- Accurate book position calculation based on chapter data
- Desktop-only support (required for filesystem access)

### Technical
- Local WASM bundling for offline support and privacy
- No external network requests during plugin operation
