# Power BI Custom Visual: Login

A custom Power BI visual that provides a login interface with password-based organization filtering. The visual allows users to enter a password and filters the data source based on the organization value. Password persists across page navigations, making it ideal for use as a login page at the beginning of presentations.

**Visual Name in Power BI:** Login  
**Package File:** `OrgPassFilter.1.0.3.0.pbiviz`  
**Version:** 1.0.3.0

## Features

- **Password-based filtering**: Enter a password to filter data by organization
- **Admin password support**: Configure an admin password to view all data without organization filtering
- **Password persistence**: Password value persists across page navigations using Power BI's built-in persistence mechanism
- **Auto-filter restoration**: Automatically reapplies filters when navigating between pages
- **Customizable title**: Change the component title/label via formatting options (default: "Login")
- **Secure access control**: Different passwords unlock different organizations
- **Global filtering**: Applies filters to all visuals using the same data source
- **Dynamic filtering**: Filters are applied to the Power BI data model in real-time
- **Customizable password mapping**: Configure password-to-organization mappings via formatting options
- **Data protection**: Blocks all data access until a valid password is entered
- **Clean UI**: Power BI default title is hidden, showing only your custom title
- **User-friendly messages**: Displays custom error and success messages below the password field

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
   This creates `OrgPassFilter.1.0.3.0.pbiviz` in the `dist` folder.

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
   - Choose `OrgPassFilter.1.0.3.0.pbiviz` from the `dist` folder

2. **Add data:**
   - Import your `data.csv` file into Power BI
   - Drag the visual to your report canvas
   - Add your data fields to the visual (especially the Organization column)

3. **Configure the visual:**
   - Select the visual
   - Go to **Format visual** pane
   - **General Settings:**
     - **Title**: Customize the title/label displayed above the password input (default: "Login")
   - **Filter Settings:**
     - **Organization Password Mapping**: Edit the JSON mapping:
       ```json
       {
         "FAO123": "FAO",
         "UNICEF123": "UNICEF",
         "UNHCR123": "UNHCR",
         "WHO123": "WHO",
         "WIPO123": "WIPO"
       }
       ```
     - **Admin Password**: (Optional) Enter an admin password to view all data without organization filtering

4. **Use the visual:**
   - Enter a password in the input field (e.g., "FAO123")
   - Click **Enter** or press Enter
   - The visual will filter data by the corresponding organization
   - All visuals using the same data source will be filtered automatically
   - **Password persistence**: The visual uses a smart dual-strategy approach:
     - **Strategy 1**: Restores password from persisted properties (if available)
     - **Strategy 2**: If properties aren't available, it checks the filter state and reverse-engineers the password from the currently filtered organization
   - **Best Practice**: Place the visual on a dedicated login page (Page 1). When password is entered, the filter persists across ALL pages automatically. You can optionally add the visual to other pages if users need to change passwords, but it's not required.
   - Clear the password field and click Enter to reset the filter
   - **Admin mode**: Enter the admin password (if configured) to view all data without filtering

## Default Password Mappings

The visual comes with default password mappings:
- `FAO123` → FAO
- `UNICEF123` → UNICEF
- `UNHCR123` → UNHCR
- `WHO123` → WHO
- `WIPO123` → WIPO

You can customize these in the visual's formatting options.

## Admin Password Feature

The visual supports an optional admin password that bypasses organization filtering:

- **Configure Admin Password**: Set an admin password in **Filter Settings** → **Admin Password**
- **Admin Access**: When the admin password is entered, all filters are cleared and all data is displayed
- **Use Case**: Useful for administrators or reviewers who need to see all data across all organizations
- **Priority**: Admin password is checked first before organization password mappings
- **Message**: When admin password is used, you'll see "Admin access granted - showing all data"

## Data Requirements

- Your dataset must contain an **Organization** column (or column with "Organization" or "Org" in the name)
- The visual will automatically detect the organization column (case-insensitive)
- The organization values should match the values in your password mapping exactly (case-sensitive)
- All visuals that need to be filtered must use the same data source table

## Password Persistence

The visual uses a **dual-strategy approach** for password persistence:

### Strategy 1: Persisted Properties
- Uses Power BI's `persistProperties` mechanism to save the password
- Works when visuals are synchronized (when copying, choose "Synchronize")

### Strategy 2: Filter State Detection (Smart Fallback)
- **This is the key innovation!** Since filters persist across pages in Power BI, the visual can detect if a filter is already applied
- When you navigate to a new page, if a filter is active, the visual examines which organization is currently filtered
- It then reverse-engineers which password was used to create that filter
- The password is automatically restored to the input field

### How It Works:
1. **Enter password on Page 1** → Filter is applied globally
2. **Navigate to Page 2** → Filter persists (Power BI does this automatically)
3. **Visual detects filter** → Sees only "FAO" organization is shown
4. **Reverse-engineers password** → Looks up which password maps to "FAO" → Finds "FAO123"
5. **Restores password** → Input field is auto-filled with "FAO123"

### Best Practice:
- **Recommended**: Place the visual on **ONE page only** (e.g., Page 1 - Login Page)
- When password is entered, the filter applies to **ALL pages automatically**
- Other pages don't need the visual - they just show filtered data
- Users only need to enter password once per session
- If you want to allow password changes from any page, you can add the visual to multiple pages, and it will auto-detect the current filter state

**Note:** The password is stored within the Power BI report file and persists for the current session. It will be cleared when the report is closed or refreshed.

## User Messages

The visual displays custom messages below the password field to provide user feedback:
- **Error messages**: "Please enter a password" or "Invalid password" when validation fails
- **Success messages**: "Access granted" when a valid password is entered (displays for 3 seconds)
- These messages appear directly below the password input field for clear visibility

## Security Considerations

⚠️ **Important Security Notes:**

- This visual provides **client-side password protection only** - it's not a secure authentication mechanism
- Passwords are stored in plain text in the visual's configuration and persisted properties
- This is suitable for basic access control within Power BI reports but should not be used for sensitive data protection
- For production use, consider implementing proper authentication at the data source level
- Password persistence is session-based and stored within the Power BI report file

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
- Make sure you've imported `OrgPassFilter.1.0.3.0.pbiviz` correctly
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
5. Re-import `OrgPassFilter.1.0.3.0.pbiviz` in Power BI Desktop

**Development Server:**
- Run `npm start` to start the development server (optional)
- Note: The development server is mainly useful for automatic recompilation
- For testing, import the compiled `.pbiviz` file directly in Power BI Desktop

## License

MIT

## References

- [Power BI Custom Visuals Documentation](https://learn.microsoft.com/en-us/power-bi/developer/visuals/)
- [Power BI Visuals API](https://github.com/Microsoft/PowerBI-Visuals)

