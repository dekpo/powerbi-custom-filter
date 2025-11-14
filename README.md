# Power BI Custom Visual: Organization Password Filter

A custom Power BI visual that allows users to enter a password and filters the data source based on the organization value. The visual provides password-based access control, filtering all visuals that share the same data source when a valid password is entered.

**Visual Name in Power BI:** Organization Password Filter  
**Package File:** `OrgPassFilter.1.0.0.0.pbiviz`

## Features

- **Password-based filtering**: Enter a password to filter data by organization
- **Secure access control**: Different passwords unlock different organizations
- **Global filtering**: Applies filters to all visuals using the same data source
- **Dynamic filtering**: Filters are applied to the Power BI data model in real-time
- **Customizable password mapping**: Configure password-to-organization mappings via formatting options
- **Data protection**: Blocks all data access until a valid password is entered

## Prerequisites

- Node.js (v14 or higher)
- Power BI Visuals Tools (`pbiviz` CLI)
- Power BI Desktop

## Installation

1. **Install Power BI Visuals Tools globally:**
   ```bash
   npm install -g powerbi-visuals-tools
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

## Building the Visual

1. **Build the visual package:**
   ```bash
   npm run build
   ```
   This creates `OrgPassFilter.1.0.0.0.pbiviz` in the `dist` folder.

2. **Or start the development server (optional):**
   ```bash
   npm start
   ```
   This starts a local server for development. Note: You'll still need to import the compiled `.pbiviz` file in Power BI Desktop for testing.

## Usage in Power BI

1. **Import the visual:**
   - Open Power BI Desktop
   - Go to **Visualizations** pane
   - Click the **...** (three dots) at the bottom
   - Select **Import a visual from a file**
   - Choose `OrgPassFilter.1.0.0.0.pbiviz` from the `dist` folder

2. **Add data:**
   - Import your `data.csv` file into Power BI
   - Drag the visual to your report canvas
   - Add your data fields to the visual (especially the Organization column)

3. **Configure password mapping:**
   - Select the visual
   - Go to **Format visual** pane
   - Expand **Filter Settings**
   - Edit the **Organization Password Mapping** JSON:
     ```json
     {
       "FAO123": "FAO",
       "UNICEF123": "UNICEF",
       "UNHCR123": "UNHCR",
       "WHO123": "WHO",
       "WIPO123": "WIPO"
     }
     ```

4. **Use the visual:**
   - Enter a password in the input field (e.g., "FAO123")
   - Click **Enter** or press Enter
   - The visual will filter data by the corresponding organization
   - All visuals using the same data source will be filtered automatically
   - Clear the password field and click Enter to reset the filter

## Default Password Mappings

The visual comes with default password mappings:
- `FAO123` → FAO
- `UNICEF123` → UNICEF
- `UNHCR123` → UNHCR
- `WHO123` → WHO
- `WIPO123` → WIPO

You can customize these in the visual's formatting options.

## Data Requirements

- Your dataset must contain an **Organization** column (or column with "Organization" or "Org" in the name)
- The visual will automatically detect the organization column (case-insensitive)
- The organization values should match the values in your password mapping exactly (case-sensitive)
- All visuals that need to be filtered must use the same data source table

## Security Considerations

⚠️ **Important Security Notes:**

- This visual provides **client-side password protection only** - it's not a secure authentication mechanism
- Passwords are stored in plain text in the visual's configuration
- This is suitable for basic access control within Power BI reports but should not be used for sensitive data protection
- For production use, consider implementing proper authentication at the data source level

## Project Structure

```
.
├── src/
│   ├── visual.ts          # Main visual logic
│   └── settings.ts        # Formatting settings
├── style/
│   └── visual.less        # Visual styling
├── capabilities.json      # Visual capabilities definition
├── pbiviz.json           # Visual configuration
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Troubleshooting

**Visual not appearing:**
- Make sure you've imported `OrgPassFilter.1.0.0.0.pbiviz` correctly
- Check that Power BI Desktop is updated to the latest version
- Try restarting Power BI Desktop after importing

**Filtering not working:**
- Verify that your data has an Organization column (or column with "Org" in the name)
- Check that the password mapping JSON is valid
- Ensure organization values match exactly (case-sensitive)
- Make sure all visuals that should be filtered use the same data source table

**No data displayed:**
- Enter a valid password first - the visual blocks all data until a password is entered
- Make sure data fields are added to the visual
- Check that the Organization column is properly mapped
- Verify your data is loaded correctly in Power BI

**Other visuals not filtering:**
- Ensure all visuals use the same data source table
- Verify that the Organization column exists in all visuals
- Check that the column names match exactly across all visuals

## Development

To modify the visual:

1. Edit the TypeScript files in `src/`
2. Modify styles in `style/visual.less`
3. Update capabilities in `capabilities.json`
4. Rebuild with `npm run build`
5. Re-import `OrgPassFilter.1.0.0.0.pbiviz` in Power BI Desktop

**Development Server:**
- Run `npm start` to start the development server (optional)
- Note: The development server is mainly useful for automatic recompilation
- For testing, import the compiled `.pbiviz` file directly in Power BI Desktop

## License

MIT

## References

- [Power BI Custom Visuals Documentation](https://learn.microsoft.com/en-us/power-bi/developer/visuals/)
- [Power BI Visuals API](https://github.com/Microsoft/PowerBI-Visuals)

