"use strict";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import "./../style/visual.less";

// Import types from powerbi-visuals-api
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import ISelectionId = powerbi.visuals.ISelectionId;

// Interface for data points with identity and organization
interface DataPoint {
    identity: ISelectionId;
    org: string;
    [key: string]: any; // Allow other properties
}

// ViewModel to hold data points
interface ViewModel {
    dataPoints: DataPoint[];
}

export class OrganizationPasswordFilter implements powerbi.extensibility.visual.IVisual {
    private host: IVisualHost;
    private element: HTMLElement;
    private formattingSettings!: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private passwordInput: HTMLInputElement;
    private submitButton: HTMLButtonElement;
    private messageDiv: HTMLDivElement;
    private titleLabel: HTMLDivElement;
    private currentOrganization: string | null = null;
    private allData: any[] = [];
    private viewModel: ViewModel = { dataPoints: [] };
    private currentDataView: DataView | null = null;

    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("VisualConstructorOptions is required");
        }
        this.host = options.host;
        this.element = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        
        // Create container
        const container = document.createElement("div");
        container.className = "passwordFilterContainer";
        
        // Create title label
        this.titleLabel = document.createElement("div");
        this.titleLabel.className = "titleLabel";
        this.titleLabel.textContent = "Login"; // Default title
        
        // Create password input section
        const passwordSection = document.createElement("div");
        passwordSection.className = "passwordSection";
        
        this.passwordInput = document.createElement("input");
        this.passwordInput.type = "password";
        this.passwordInput.className = "passwordInput";
        this.passwordInput.placeholder = "Enter password";
        
        this.submitButton = document.createElement("button");
        this.submitButton.textContent = "Enter";
        this.submitButton.className = "submitButton";
        
        this.messageDiv = document.createElement("div");
        this.messageDiv.className = "messageDiv";
        
        passwordSection.appendChild(this.passwordInput);
        passwordSection.appendChild(this.submitButton);
        passwordSection.appendChild(this.messageDiv);
        
        container.appendChild(this.titleLabel);
        container.appendChild(passwordSection);
        
        this.element.appendChild(container);
        
        // Hide Power BI's default title/header (shows column name like "Organization")
        this.hidePowerBITitle();
        
        // Add event listeners
        this.submitButton.addEventListener("click", () => this.handlePasswordSubmit());
        this.passwordInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                this.handlePasswordSubmit();
            }
        });

    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews);
        
        // Update title label from settings
        const title = this.formattingSettings?.general?.title?.value || "Login";
        if (this.titleLabel) {
            this.titleLabel.textContent = title;
        }
        
        const dataView: DataView = options.dataViews[0];
        if (!dataView || !dataView.table) {
            // Block all data access if no data view
            this.blockAllData();
            return;
        }
        
        // Store dataView for filter operations (needed for password validation)
        this.currentDataView = dataView;

        // CRITICAL: Check if filter is already applied BEFORE blocking data
        // This allows us to detect filters that persist across pages
        let existingFilterOrg: string | null = null;
        if (dataView.table && dataView.table.rows && dataView.table.rows.length > 0) {
            const orgColIndex = dataView.table.columns.findIndex((col: any) => {
                const colName = (col.displayName || col.queryName || "").toLowerCase();
                return colName.includes("organization") || colName.includes("org");
            });
            if (orgColIndex >= 0) {
                const filteredOrgs = new Set<string>();
                dataView.table.rows.forEach((row: any) => {
                    const orgValue = String(row[orgColIndex] || "").trim();
                    if (orgValue) filteredOrgs.add(orgValue);
                });
                // If only ONE organization is shown, a filter is likely active
                if (filteredOrgs.size === 1) {
                    existingFilterOrg = Array.from(filteredOrgs)[0];
                    console.log("[PasswordFilter] ⚠️ Detected existing filter for organization:", existingFilterOrg);
                }
            }
        }

        // Strategy 1: Try to restore password from persisted properties (check ALL locations)
        // NOTE: This only works if visuals are synchronized OR if it's the same visual instance
        let passwordRestored = this.restorePasswordFromProperties(options);
        
        // DEBUG: Log whether metadata.objects exists
        if (options?.dataViews?.[0]?.metadata?.objects) {
            console.log("[PasswordFilter] ✓ metadata.objects is available - persistProperties should work");
        } else {
            console.log("[PasswordFilter] ⚠️ metadata.objects is UNDEFINED - visual instances are NOT synchronized!");
            console.log("[PasswordFilter] ⚠️ SOLUTION: Copy visual to other pages and choose 'Synchronize' when prompted");
        }

        // Strategy 2: If we detected an existing filter, restore password from it immediately
        if (!passwordRestored && existingFilterOrg && this.formattingSettings) {
            console.log("[PasswordFilter] Found existing filter, restoring password from organization:", existingFilterOrg);
            const mappingJson = this.formattingSettings?.filterSettings?.organizationMapping?.value || 
                this.getDefaultPasswordMapping();
            let passwordMapping: { [key: string]: string };
            try {
                passwordMapping = typeof mappingJson === "string" ? JSON.parse(mappingJson) : mappingJson;
            } catch (e) {
                passwordMapping = this.getDefaultPasswordMapping();
            }
            // Find password that maps to this organization
            for (const [password, org] of Object.entries(passwordMapping)) {
                if (org === existingFilterOrg) {
                    this.passwordInput.value = password;
                    this.currentOrganization = existingFilterOrg;
                    passwordRestored = true;
                    console.log("[PasswordFilter] ✓ Password restored from existing filter:", password, "→", existingFilterOrg);
                    break;
                }
            }
        }
        
        // Strategy 3: If still no password, try filter state detection (fallback)
        if (!passwordRestored && this.formattingSettings) {
            console.log("[PasswordFilter] Properties restore failed, trying filter state detection...");
            passwordRestored = this.restorePasswordFromFilter(dataView);
        }
        
        // Strategy 3: If still no password, try again after a short delay (filter might not be applied yet)
        // This handles race conditions where filter hasn't been applied when visual loads
        if (!passwordRestored && this.formattingSettings) {
            setTimeout(() => {
                if (!this.passwordInput.value.trim()) {
                    console.log("[PasswordFilter] Retrying filter state detection after delay...");
                    const retryRestored = this.restorePasswordFromFilter(dataView);
                    if (retryRestored && this.passwordInput.value.trim()) {
                        const retryPassword = this.passwordInput.value.trim();
                        console.log("[PasswordFilter] ✓ Password restored on retry:", retryPassword);
                        this.validateAndApplyPassword(retryPassword, true);
                    }
                }
            }, 500); // Wait 500ms for filter to be applied
        }

        // If password was restored, validate and apply it immediately (synchronously)
        // This ensures currentOrganization is set before we check it below
        if (passwordRestored && this.passwordInput && this.passwordInput.value.trim()) {
            const restoredPassword = this.passwordInput.value.trim();
            console.log("[PasswordFilter] Immediately validating restored password:", restoredPassword);
            this.validateAndApplyPassword(restoredPassword, true);
        }

        // Extract data from dataView
        const table = dataView.table;
        const rows = table.rows;
        
        if (!rows || rows.length === 0) {
            // Block all data access if no rows
            this.blockAllData();
            return;
        }

        // Get column names
        const columns = table.columns.map((col: any) => col.displayName || col.queryName);
        
        // Store all data and build dataPoints with identities
        this.allData = rows.map((row: any) => {
            const rowData: any = {};
            columns.forEach((col: string, index: number) => {
                rowData[col] = row[index];
            });
            return rowData;
        });

        // Find organization column index first
        const orgColIndex = table.columns.findIndex((col: any) => {
            const colName = (col.displayName || col.queryName || "").toLowerCase();
            return colName.includes("organization") || colName.includes("org");
        });

        // Build dataPoints with identities for selection manager
        this.viewModel.dataPoints = rows.map((row: any, index: number) => {
            // Get organization value
            const orgValue = orgColIndex >= 0 ? String(row[orgColIndex] || "") : "";
            
            // Create selection ID using selectionIdBuilder
            // For table data, we can use withTable or create based on row index
            const selectionIdBuilder = this.host.createSelectionIdBuilder();
            let identity: ISelectionId;
            
            // Try to use table identity if available (Power BI provides this)
            if (table.identity && table.identity[index]) {
                // Convert CustomVisualOpaqueIdentity to ISelectionId if needed
                // In Power BI, table.identity can be used directly with selection manager
                identity = table.identity[index] as any as ISelectionId;
            } else {
                // Build identity using withTable - this creates an identity for a table row
                // We use the table metadata and row index
                if (orgColIndex >= 0 && table.columns[orgColIndex]) {
                    // Use withTable to create identity based on table structure
                    selectionIdBuilder.withTable(table, index);
                    identity = selectionIdBuilder.createSelectionId();
                } else {
                    // Fallback: create a basic selection ID
                    identity = selectionIdBuilder.createSelectionId();
                }
            }
            
            return {
                identity: identity,
                org: orgValue,
                ...this.allData[index]
            };
        });

        // Fallback: Trigger auto-submit if password exists but wasn't validated yet
        // This handles edge cases where immediate validation might have failed
        this.triggerAutoSubmitIfNeeded();

        // CRITICAL: Block all data access if no password has been entered
        if (!this.currentOrganization) {
            this.blockAllData();
        } else if (this.currentOrganization === "ADMIN") {
            // Admin mode - clear all filters to show all data
            this.clearFilter();
        } else {
            // Apply filter for the current organization
            // IMPORTANT: Re-apply filter on every page load to ensure it persists
            // Power BI filters might not persist across pages, so we re-apply them
            this.applyFilter(this.currentOrganization);
        }
    }

    private handlePasswordSubmit() {
        const password = this.passwordInput.value.trim();
        
        console.log("[PasswordFilter] Password submitted:", password);
        
        if (!password) {
            this.showMessage("Please enter a password", "error");
            this.currentOrganization = null;
            // Block all data access when password is empty
            this.blockAllData();
            // Clear persisted password when empty
            this.savePasswordToProperties("");
            return;
        }

        // CRITICAL: Save password FIRST before validation
        // This ensures it's persisted even if validation fails
        this.savePasswordToProperties(password);
        
        // Validate and apply password (with messages)
        this.validateAndApplyPassword(password, false);
        
        // Force Power BI to persist by triggering a visual update
        // This ensures the persisted properties are saved to the report
        if (this.currentDataView) {
            // Re-trigger update to ensure persistence
            setTimeout(() => {
                this.savePasswordToProperties(password);
            }, 100);
        }
    }

    private getDefaultPasswordMapping(): { [key: string]: string } {
        return {
            "FAO123": "FAO",
            "UNICEF123": "UNICEF",
            "UNHCR123": "UNHCR",
            "WHO123": "WHO",
            "WIPO123": "WIPO"
        };
    }

    private blockAllData() {
        try {
            console.log("[PasswordFilter] Blocking all data access - no valid password");
            
            if (!this.currentDataView || !this.currentDataView.table) {
                // If no data view, try to apply a blocking filter anyway
                // This will prevent any data from showing
                const blockingFilter: any = {
                    $schema: "http://powerbi.com/product/schema#basic",
                    target: {},
                    operator: "None"
                };
                this.host.applyJsonFilter(blockingFilter, "general", "filter", powerbi.FilterAction.merge);
                return;
            }

            // Find organization column
            const table = this.currentDataView.table;
            const orgColIndex = table.columns.findIndex((col: any) => {
                const colName = (col.displayName || col.queryName || "").toLowerCase();
                return colName.includes("organization") || colName.includes("org");
            });

            if (orgColIndex < 0) {
                // If no organization column, apply a blocking filter
                const blockingFilter: any = {
                    $schema: "http://powerbi.com/product/schema#basic",
                    target: {},
                    operator: "None"
                };
                this.host.applyJsonFilter(blockingFilter, "general", "filter", powerbi.FilterAction.merge);
                return;
            }

            const orgColumn = table.columns[orgColIndex];
            const queryName = orgColumn.queryName || orgColumn.displayName;
            const tableName = queryName.split('.')[0] || queryName;
            const columnName = queryName.split('.').pop() || orgColumn.displayName;
            
            // Apply a filter that matches NO organizations (empty array)
            // This will block all data from being displayed
            const blockingFilter: any = {
                $schema: "http://powerbi.com/product/schema#basic",
                target: {
                    table: tableName,
                    column: columnName
                },
                operator: "In",
                values: [] // Empty array means no data matches
            };

            console.log("[PasswordFilter] Applying blocking filter:", JSON.stringify(blockingFilter, null, 2));
            this.host.applyJsonFilter(blockingFilter, "general", "filter", powerbi.FilterAction.merge);
            
        } catch (error: any) {
            console.error("[PasswordFilter] Error blocking data:", error);
        }
    }

    private applyFilter(organization: string) {
        try {
            if (!this.currentDataView || !this.currentDataView.table) {
                this.showMessage("No data view available for filtering", "error");
                console.error("[PasswordFilter] No data view available");
                return;
            }

            // Find organization column
            const table = this.currentDataView.table;
            const orgColIndex = table.columns.findIndex((col: any) => {
                const colName = (col.displayName || col.queryName || "").toLowerCase();
                return colName.includes("organization") || colName.includes("org");
            });

            if (orgColIndex < 0) {
                this.showMessage("Organization column not found", "error");
                console.error("[PasswordFilter] Organization column not found in columns:", table.columns.map((c: any) => c.displayName || c.queryName));
                return;
            }

            const orgColumn = table.columns[orgColIndex];
            
            // Get the table name from metadata or use queryName
            // The queryName typically contains the table name (e.g., "Table1.Organization")
            const queryName = orgColumn.queryName || orgColumn.displayName;
            const tableName = queryName.split('.')[0] || queryName;
            const columnName = queryName.split('.').pop() || orgColumn.displayName;
            
            console.log("[PasswordFilter] Applying filter:", {
                organization,
                tableName,
                columnName,
                queryName,
                displayName: orgColumn.displayName
            });
            
            // Create a basic filter JSON
            // This filter will be applied to all visuals using the same data source
            const filterJson: any = {
                $schema: "http://powerbi.com/product/schema#basic",
                target: {
                    table: tableName,
                    column: columnName
                },
                operator: "In",
                values: [organization]
            };

            console.log("[PasswordFilter] Filter JSON:", JSON.stringify(filterJson, null, 2));

            // Apply the filter globally using host.applyJsonFilter
            // Use merge - this is the standard way to apply filters
            this.host.applyJsonFilter(filterJson, "general", "filter", powerbi.FilterAction.merge);
            
            console.log("[PasswordFilter] Filter applied successfully");
            
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            this.showMessage(`Filter error: ${errorMsg}`, "error");
            console.error("[PasswordFilter] Filter error:", error);
            console.error("[PasswordFilter] Error stack:", error?.stack);
        }
    }

    /**
     * Clear all filters to show all data (admin mode)
     */
    private clearFilter() {
        try {
            if (!this.currentDataView || !this.currentDataView.table) {
                console.log("[PasswordFilter] No data view available for clearing filter");
                return;
            }

            // Find organization column
            const table = this.currentDataView.table;
            const orgColIndex = table.columns.findIndex((col: any) => {
                const colName = (col.displayName || col.queryName || "").toLowerCase();
                return colName.includes("organization") || colName.includes("org");
            });

            if (orgColIndex < 0) {
                console.log("[PasswordFilter] Organization column not found, removing filter");
                // Remove filter by passing empty array
                this.host.applyJsonFilter([], "general", "filter", powerbi.FilterAction.remove);
                return;
            }

            const orgColumn = table.columns[orgColIndex];
            const queryName = orgColumn.queryName || orgColumn.displayName;
            const tableName = queryName.split('.')[0] || queryName;
            const columnName = queryName.split('.').pop() || orgColumn.displayName;
            
            // Get all unique organization values to create a filter that includes everything
            const uniqueOrgs = new Set<string>();
            if (table.rows) {
                table.rows.forEach((row: any) => {
                    const orgValue = String(row[orgColIndex] || "").trim();
                    if (orgValue) {
                        uniqueOrgs.add(orgValue);
                    }
                });
            }
            
            const allOrgs = Array.from(uniqueOrgs);
            
            console.log("[PasswordFilter] Clearing filter for admin access - showing all organizations:", {
                tableName,
                columnName,
                organizationCount: allOrgs.length
            });
            
            if (allOrgs.length > 0) {
                // Create a filter that includes all organizations (effectively shows all data)
                const filterJson: any = {
                    $schema: "http://powerbi.com/product/schema#basic",
                    target: {
                        table: tableName,
                        column: columnName
                    },
                    operator: "In",
                    values: allOrgs
                };
                
                // Apply filter with all organizations
                this.host.applyJsonFilter(filterJson, "general", "filter", powerbi.FilterAction.merge);
            } else {
                // If no organizations found, remove the filter
                this.host.applyJsonFilter([], "general", "filter", powerbi.FilterAction.remove);
            }
            
            console.log("[PasswordFilter] Filter cleared successfully - showing all data");
            
        } catch (error: any) {
            console.error("[PasswordFilter] Error clearing filter:", error);
            // Try alternative method: remove filter with empty array
            try {
                this.host.applyJsonFilter([], "general", "filter", powerbi.FilterAction.remove);
            } catch (e) {
                console.error("[PasswordFilter] Failed to clear filter:", e);
            }
        }
    }

    private showMessage(message: string, type: "success" | "error") {
        this.messageDiv.textContent = message;
        this.messageDiv.className = `messageDiv ${type}`;
        
        if (type === "success") {
            setTimeout(() => {
                this.messageDiv.textContent = "";
                this.messageDiv.className = "messageDiv";
            }, 3000);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public enumerateObjectInstances(
        _options: EnumerateVisualObjectInstancesOptions
    ): VisualObjectInstanceEnumeration {
        // FormattingSettingsService doesn't have enumerateObjectInstances in this version
        // Return empty enumeration - formatting is handled via getFormattingModel
        return [];
    }

    /**
     * Save password using multiple strategies for end-user persistence
     * Strategy 1: sessionStorage (works for end-users across pages in the same session)
     * Strategy 2: persistProperties (works during editing/design mode)
     */
    private savePasswordToProperties(password: string): void {
        // Strategy 1: Try sessionStorage (for end-users viewing the report)
        // sessionStorage persists across pages in the same browser session
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('powerbi_org_password', password);
                console.log("[PasswordFilter] ✓ Password saved to sessionStorage (end-user mode):", password);
            }
        } catch (storageError) {
            console.warn("[PasswordFilter] sessionStorage not available:", storageError);
        }
        
        // Strategy 2: Save via persistProperties (for editing mode)
        try {
            this.host.persistProperties({
                merge: [{
                    objectName: "passwordSettings",
                    properties: {
                        savedPassword: password
                    },
                    selector: null as any
                }]
            });
            console.log("[PasswordFilter] ✓ Password saved via persistProperties (editing mode)");
        } catch (error) {
            console.warn("[PasswordFilter] persistProperties failed:", error);
        }
    }

    /**
     * Restore password from multiple sources
     * Priority 1: sessionStorage (for end-users)
     * Priority 2: persistProperties (for editing mode)
     * Returns true if a password was restored, false otherwise
     */
    private restorePasswordFromProperties(options: VisualUpdateOptions): boolean {
        try {
            if (!this.passwordInput) {
                return false;
            }

            let persistedPassword = "";

            // PRIORITY 1: Try sessionStorage first (works for end-users viewing the report)
            try {
                if (typeof sessionStorage !== 'undefined') {
                    const sessionPass = sessionStorage.getItem('powerbi_org_password');
                    if (sessionPass && sessionPass.trim()) {
                        persistedPassword = sessionPass;
                        console.log("[PasswordFilter] ✓ Password restored from sessionStorage (end-user mode):", persistedPassword);
                    }
                }
            } catch (storageError) {
                console.warn("[PasswordFilter] sessionStorage read failed:", storageError);
            }

            // Try to read from Power BI's persisted properties
            // Check ALL possible locations where properties might be stored
            
            if (options?.dataViews?.[0]) {
                const dataView = options.dataViews[0];
                
                // Method 1: Read from metadata.objects.passwordSettings.savedPassword (standard way)
                const objects = dataView?.metadata?.objects;
                if (objects?.passwordSettings) {
                    persistedPassword = (objects.passwordSettings as any)?.savedPassword as string || "";
                    console.log("[PasswordFilter] Method 1 - metadata.objects.passwordSettings:", persistedPassword || "not found");
                }
                
                // Method 2: Check metadata.objects directly (alternative structure)
                if (!persistedPassword && (dataView.metadata as any)?.objects?.passwordSettings) {
                    persistedPassword = ((dataView.metadata as any).objects.passwordSettings as any)?.savedPassword as string || "";
                    console.log("[PasswordFilter] Method 2 - (dataView.metadata as any).objects:", persistedPassword || "not found");
                }
                
                // Method 3: Check if properties are stored at the root level of objects
                if (!persistedPassword && objects) {
                    // Sometimes properties are stored directly in objects
                    for (const key in objects) {
                        if (objects[key] && (objects[key] as any).savedPassword) {
                            persistedPassword = (objects[key] as any).savedPassword as string || "";
                            console.log("[PasswordFilter] Method 3 - Found savedPassword in objects." + key + ":", persistedPassword);
                            break;
                        }
                    }
                }
                
                // Method 4: Check dataView.metadata directly (deep fallback)
                if (!persistedPassword) {
                    const metadata = dataView.metadata as any;
                    if (metadata?.objects) {
                        // Try all possible nested structures
                        const checkNested = (obj: any, path: string = ""): string => {
                            if (!obj || typeof obj !== "object") return "";
                            if (obj.savedPassword && typeof obj.savedPassword === "string") {
                                console.log("[PasswordFilter] Method 4 - Found savedPassword at path:", path);
                                return obj.savedPassword;
                            }
                            for (const key in obj) {
                                const result = checkNested(obj[key], path ? `${path}.${key}` : key);
                                if (result) return result;
                            }
                            return "";
                        };
                        persistedPassword = checkNested(metadata.objects);
                    }
                }
            }
            
            // Method 5: Try to get from host directly (if available)
            if (!persistedPassword && (this.host as any).getPersistedProperties) {
                try {
                    const persisted = (this.host as any).getPersistedProperties();
                    if (persisted?.passwordSettings?.savedPassword) {
                        persistedPassword = persisted.passwordSettings.savedPassword;
                        console.log("[PasswordFilter] Method 5 - Found via host.getPersistedProperties:", persistedPassword);
                    }
                } catch (e) {
                    // Method not available, ignore
                }
            }
            
            // If we found a persisted password, restore it
            if (persistedPassword && persistedPassword.trim()) {
                const currentValue = this.passwordInput.value.trim();
                if (!currentValue || currentValue !== persistedPassword) {
                    this.passwordInput.value = persistedPassword;
                    console.log("[PasswordFilter] ✓ Password restored from persistProperties:", persistedPassword);
                    return true;
                } else {
                    console.log("[PasswordFilter] ✓ Password already set:", persistedPassword);
                    return true;
                }
            }
            
            console.log("[PasswordFilter] ✗ No persisted password found in any location");
            return false;
        } catch (error) {
            console.warn("[PasswordFilter] Failed to restore password:", error);
            return false;
        }
    }

    /**
     * Restore password by checking if a filter is already applied
     * This works because filters persist across pages, so we can reverse-engineer the password
     * Returns true if password was restored, false otherwise
     */
    private restorePasswordFromFilter(dataView: DataView): boolean {
        try {
            if (!this.passwordInput || !dataView?.table || !this.formattingSettings) {
                return false;
            }

            // Check if there's already a filter applied by examining the data
            // If data is filtered, we can determine which organization is shown
            const table = dataView.table;
            const orgColIndex = table.columns.findIndex((col: any) => {
                const colName = (col.displayName || col.queryName || "").toLowerCase();
                return colName.includes("organization") || colName.includes("org");
            });

            if (orgColIndex < 0) {
                console.log("[PasswordFilter] Filter detection: Organization column not found");
                return false;
            }

            if (!table.rows || table.rows.length === 0) {
                console.log("[PasswordFilter] Filter detection: No rows in data");
                return false;
            }

            // Get unique organization values from the filtered data
            const filteredOrgs = new Set<string>();
            table.rows.forEach((row: any) => {
                const orgValue = String(row[orgColIndex] || "").trim();
                if (orgValue) {
                    filteredOrgs.add(orgValue);
                }
            });

            console.log("[PasswordFilter] Filter detection: Found organizations:", Array.from(filteredOrgs));

            // Get password mapping
            const mappingJson = this.formattingSettings?.filterSettings?.organizationMapping?.value || 
                this.getDefaultPasswordMapping();
            
            let passwordMapping: { [key: string]: string };
            try {
                passwordMapping = typeof mappingJson === "string" ? JSON.parse(mappingJson) : mappingJson;
            } catch (e) {
                console.warn("[PasswordFilter] Failed to parse password mapping, using defaults");
                passwordMapping = this.getDefaultPasswordMapping();
            }

            // If only one organization is shown, we can reverse-engineer the password
            if (filteredOrgs.size === 1) {
                const filteredOrg = Array.from(filteredOrgs)[0];
                console.log("[PasswordFilter] Filter detection: Single organization detected:", filteredOrg);
                
                // Find password that maps to this organization
                for (const [password, org] of Object.entries(passwordMapping)) {
                    if (org === filteredOrg) {
                        // Found the password! Restore it
                        const currentValue = this.passwordInput.value.trim();
                        if (!currentValue || currentValue !== password) {
                            this.passwordInput.value = password;
                            this.currentOrganization = filteredOrg;
                            console.log("[PasswordFilter] ✓ Password restored from filter state:", password, "→", filteredOrg);
                            return true;
                        } else {
                            this.currentOrganization = filteredOrg;
                            console.log("[PasswordFilter] ✓ Password already matches filter state:", password);
                            return true;
                        }
                    }
                }
                console.log("[PasswordFilter] Filter detection: No password found for organization:", filteredOrg);
            } else if (filteredOrgs.size > 1) {
                // Multiple orgs shown - might be admin mode or no filter
                console.log("[PasswordFilter] Filter detection: Multiple organizations detected (might be admin or no filter):", Array.from(filteredOrgs));
                
                // If admin password exists and we see multiple orgs, it might be admin mode
                // But we can't be sure, so we don't restore password
            } else {
                console.log("[PasswordFilter] Filter detection: No organizations found in data");
            }

            return false;
        } catch (error) {
            console.warn("[PasswordFilter] Failed to restore password from filter:", error);
            return false;
        }
    }

    /**
     * Trigger auto-submit if password was restored (called after dataView is ready)
     * This is a fallback method - password validation should happen immediately in update()
     */
    private triggerAutoSubmitIfNeeded(): void {
        try {
            if (this.passwordInput && this.currentDataView && this.currentDataView.table) {
                const password = this.passwordInput.value.trim();
                // Only trigger if password exists but currentOrganization is not set
                // This handles edge cases where immediate validation might have failed
                if (password && !this.currentOrganization) {
                    console.log("[PasswordFilter] Fallback: Validating password that wasn't validated immediately");
                    setTimeout(() => {
                        this.validateAndApplyPassword(password, true);
                    }, 100);
                }
            }
        } catch (error) {
            console.warn("[PasswordFilter] Failed to trigger auto-submit:", error);
        }
    }


    /**
     * Hide Power BI's default visual title/header
     */
    private hidePowerBITitle(): void {
        try {
            // Power BI adds a title element as a sibling or parent of our visual element
            // Try to find and hide it
            let currentElement: HTMLElement | null = this.element.parentElement;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (currentElement && attempts < maxAttempts) {
                // Look for common Power BI title elements
                const titleElements = currentElement.querySelectorAll(
                    '[class*="title"], [class*="header"], [class*="titleText"], [class*="visualTitle"]'
                );
                
                titleElements.forEach((el: Element) => {
                    const htmlEl = el as HTMLElement;
                    // Only hide if it's not our custom title
                    if (!htmlEl.classList.contains('titleLabel')) {
                        htmlEl.style.display = 'none';
                    }
                });
                
                // Also check for text nodes that might be the title
                const textContent = currentElement.textContent || '';
                if (textContent.trim() && currentElement !== this.element && 
                    !currentElement.contains(this.element)) {
                    // Check if this might be a title container
                    const children = Array.from(currentElement.children);
                    if (children.length === 1 && children[0] === this.element) {
                        // This might be a wrapper, check siblings
                        const siblings = Array.from(currentElement.parentElement?.children || []);
                        siblings.forEach((sibling: Element) => {
                            if (sibling !== currentElement && sibling.textContent) {
                                const siblingEl = sibling as HTMLElement;
                                if (siblingEl.textContent?.trim() && 
                                    !siblingEl.contains(this.element)) {
                                    siblingEl.style.display = 'none';
                                }
                            }
                        });
                    }
                }
                
                currentElement = currentElement.parentElement;
                attempts++;
            }
            
            // Also use MutationObserver to catch dynamically added titles
            if (this.element.parentElement) {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) { // Element node
                                const el = node as HTMLElement;
                                if (el.querySelector && 
                                    (el.querySelector('[class*="title"]') || 
                                     el.querySelector('[class*="header"]'))) {
                                    const titleEls = el.querySelectorAll('[class*="title"], [class*="header"]');
                                    titleEls.forEach((titleEl: Element) => {
                                        const htmlEl = titleEl as HTMLElement;
                                        if (!htmlEl.classList.contains('titleLabel')) {
                                            htmlEl.style.display = 'none';
                                        }
                                    });
                                }
                            }
                        });
                    });
                });
                
                observer.observe(this.element.parentElement, {
                    childList: true,
                    subtree: true
                });
            }
        } catch (error) {
            console.warn("[PasswordFilter] Failed to hide Power BI title:", error);
        }
    }

    /**
     * Validate password and apply filter (used for auto-submit)
     */
    private validateAndApplyPassword(password: string, silent: boolean = false): void {
        // First check if it's the admin password
        const adminPassword = this.formattingSettings?.filterSettings?.adminPassword?.value?.trim() || "";
        
        if (adminPassword && password === adminPassword) {
            // Admin password matched - show all data without filtering
            this.currentOrganization = "ADMIN"; // Special marker for admin mode
            if (!silent) {
                this.showMessage("Admin access granted - showing all data", "success");
            }
            // Clear all filters to show all data
            this.clearFilter();
            return;
        }

        // Get organization mapping from settings or use default
        const mappingJson = this.formattingSettings?.filterSettings?.organizationMapping?.value || 
            this.getDefaultPasswordMapping();
        
        let passwordMapping: { [key: string]: string };
        try {
            passwordMapping = typeof mappingJson === "string" ? JSON.parse(mappingJson) : mappingJson;
        } catch (e) {
            console.warn("[PasswordFilter] Failed to parse mapping JSON, using default:", e);
            passwordMapping = this.getDefaultPasswordMapping();
        }

        // Check password and get organization
        const organization = passwordMapping[password];
        
        if (organization) {
            this.currentOrganization = organization;
            if (!silent) {
                this.showMessage("Access granted", "success");
            }
            // Apply filter to Power BI globally
            this.applyFilter(organization);
        } else if (!silent) {
            this.showMessage("Invalid password", "error");
            this.currentOrganization = null;
            this.blockAllData();
        }
    }
}

