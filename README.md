# KMITL Schedule Builder

An unofficial Chrome extension for the KMITL registration website (regis.reg.kmitl.ac.th). This tool allows students to select subjects from the teaching table and generate a custom timetable locally in the browser.

## Features

- Inline subject selection: Adds checkboxes directly to the KMITL subject table.
- Timetable Grid: Renders selected subjects into a weekly schedule with 30-minute slots.
- Conflict Detection: Automatically highlights overlapping classes.
- Grouping Summary: Shows a summary of selected theory, practical, and seminar components.
- Export Options: Download the timetable as a PNG image or copy data as plain text.
- Local Persistence: Selected subjects are saved in your browser and survive page refreshes.

## Screenshots

### Subject selection

![Checkboxes added to the KMITL subject table](docs/images/1.png)

Select classes directly from the KMITL teaching table.

### Launcher

![Schedule Builder launcher showing the selected subject count](docs/images/2.png)

Open the builder from the fixed launcher without leaving the page.

### Timetable modal

![Generated weekly timetable modal](docs/images/3.png)

Review selected classes in a weekly timetable.

### Exported PNG

![Exported timetable PNG](docs/images/4.png)

Download the generated timetable as a PNG image for sharing or saving.

## Installation

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" using the toggle in the top-right corner.
4. Click the "Load unpacked" button.
5. Select the folder containing the extension files (the folder with manifest.json).

## Usage

1. Navigate to any teaching table page on the KMITL registration site.
2. Check the "Add" boxes next to the subjects you want to include.
3. Use the "Schedule Builder" launcher in the bottom-left corner to open the timetable modal.
4. Review your schedule, check for conflicts, and use the export buttons to save your plan.

## Privacy and Safety

- No Backend: This extension does not use any external servers.
- No Data Collection: No user data, analytics, or tracking information is collected.
- No Credential Access: The extension does not access cookies, login data, or passwords.
- Local Storage: All selected subjects are stored strictly on your local device via chrome.storage.local.

## Disclaimer

This is an unofficial project. It is not affiliated with, endorsed by, or maintained by King Mongkut's Institute of Technology Ladkrabang (KMITL). This tool is for planning purposes only and does not perform actual registration.

## Known Limitations

- Layout Dependency: The subject detection logic depends on the current HTML structure of the KMITL registration site.
- Planning Only: Final schedules should always be verified against the official registration system.

## Development Notes

- Manifest V3 compliant.
- Built using Vanilla JavaScript and CSS.
- No external libraries or remote assets are used.

## Credits

Made by twtae & His beloved AI
