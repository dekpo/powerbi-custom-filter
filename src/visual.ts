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
    private readonly STORAGE_KEY = "powerbi_org_password_filter";

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
        
        // Restore password from localStorage if available
        this.restorePasswordFromStorage();
        
        const dataView: DataView = options.dataViews[0];
        if (!dataView || !dataView.table) {
            // Block all data access if no data view
            this.blockAllData();
            return;
        }

        // Store dataView for filter operations
        this.currentDataView = dataView;

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

        // CRITICAL: Block all data access if no password has been entered
        if (!this.currentOrganization) {
            this.blockAllData();
        } else {
            // Apply filter for the current organization
            this.applyFilter(this.currentOrganization);
        }
    }

    private handlePasswordSubmit() {
        const password = this.passwordInput.value.trim();
        
        console.log("[PasswordFilter] Password submitted:", password);
        
        // Save password to localStorage for persistence
        this.savePasswordToStorage(password);
        
        if (!password) {
            this.showMessage("Please enter a password", "error");
            this.currentOrganization = null;
            // Block all data access when password is empty
            this.blockAllData();
            return;
        }

        // Validate and apply password (with messages)
        this.validateAndApplyPassword(password, false);
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
            // This will filter all visuals that use the same data source
            this.host.applyJsonFilter(filterJson, "general", "filter", powerbi.FilterAction.merge);
            
            console.log("[PasswordFilter] Filter applied successfully");
            
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            this.showMessage(`Filter error: ${errorMsg}`, "error");
            console.error("[PasswordFilter] Filter error:", error);
            console.error("[PasswordFilter] Error stack:", error?.stack);
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
     * Save password to localStorage for persistence across page navigations
     */
    private savePasswordToStorage(password: string): void {
        try {
            if (typeof Storage !== "undefined") {
                localStorage.setItem(this.STORAGE_KEY, password);
                console.log("[PasswordFilter] Password saved to localStorage");
            }
        } catch (error) {
            console.warn("[PasswordFilter] Failed to save password to localStorage:", error);
        }
    }

    /**
     * Restore password from localStorage and auto-submit if valid
     */
    private restorePasswordFromStorage(): void {
        try {
            if (typeof Storage !== "undefined" && this.passwordInput) {
                const savedPassword = localStorage.getItem(this.STORAGE_KEY);
                if (savedPassword && savedPassword.trim()) {
                    // Only restore if the input is empty (to avoid overwriting user input)
                    if (!this.passwordInput.value || this.passwordInput.value.trim() === "") {
                        this.passwordInput.value = savedPassword;
                        console.log("[PasswordFilter] Password restored from localStorage");
                        
                        // Auto-submit if password is already saved and valid
                        // This ensures the filter is applied immediately when navigating between pages
                        // Only auto-submit if we have a dataView ready
                        if (this.currentDataView && this.currentDataView.table) {
                            // Use setTimeout to ensure the dataView is fully processed
                            setTimeout(() => {
                                // Check if password is still valid before auto-submitting
                                const password = this.passwordInput.value.trim();
                                if (password) {
                                    // Validate and apply filter without showing messages
                                    this.validateAndApplyPassword(password, true);
                                }
                            }, 150);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn("[PasswordFilter] Failed to restore password from localStorage:", error);
        }
    }

    /**
     * Validate password and apply filter (used for auto-submit)
     */
    private validateAndApplyPassword(password: string, silent: boolean = false): void {
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

