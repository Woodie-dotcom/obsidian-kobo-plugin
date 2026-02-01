# Obsidian Kobo Highlights Importer

A community plugin for Obsidian that imports highlights and annotations from your Kobo eReader's SQLite database.

## Features

- **Direct Database Import**: Reads directly from the `KoboReader.sqlite` file on your device.
- **Accurate Book Position**: Calculates the global position of highlights within the book (percentage), taking chapters into account.
- **Flexible Templating**: Use custom templates with variables like `{{text}}`, `{{annotation}}`, `{{chapter}}`, `{{location}}`, and more.
- **Conditional Logic**: Supports basic conditional rendering (e.g., `{% if annotation %}...{% endif %}`).
- **Incremental Import**: Appends new highlights to existing notes without overwriting.
- **Duplicate Detection**: Prevents importing the same highlight twice.

## Usage

1. Connect your Kobo eReader to your computer via USB.
2. In Obsidian, run the command **"Kobo Highlights: Import from Device"**.
3. Select the `KoboReader.sqlite` file from your Kobo drive (usually in the `.kobo` folder).
4. The plugin will scan for highlights and import them into your configured folder.

## Templating

You can customize how highlights are formatted using the settings.

### Available Variables

- `{{text}}`: The highlighted text
- `{{annotation}}`: Your note/annotation
- `{{chapter}}`: Chapter title (if available)
- `{{location}}`: Position in book as percentage (0-100)
- `{{date_created}}`: Date the highlight was created
- `{{title}}`: Book title
- `{{author}}`: Author name

### Example Template

```markdown
> {{text}}

{% if annotation %}**Note:** {{annotation}}{% endif %}

*— {{date_created|date('DD MMM YYYY')}}{% if location %} · {{location}}%{% endif %}*
```

## Installation

1. Download the latest release.
2. Extract the files into your vault's `.obsidian/plugins/obsidian-kobo-highlights` folder.
3. Enable the plugin in Obsidian settings.

## Development

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the development build in watch mode.

## Acknowledgements
This project was partially inspired by [October](https://github.com/marcus-crane/october), a Kobo highlights extraction tool for Readwise by Marcus Crane.
