"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.Card;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * General Settings Card
 */
class GeneralSettingsCard extends FormattingSettingsCard {
    public title = new formattingSettings.TextInput({
        name: "title",
        displayName: "Title",
        value: "Login",
        placeholder: "Enter component title"
    });

    public name: string = "general";
    public displayName: string = "General";
    public slices: Array<FormattingSettingsSlice> = [this.title];
}

/**
 * Password Settings Card
 */
class PasswordSettingsCard extends FormattingSettingsCard {
    public password = new formattingSettings.TextInput({
        name: "password",
        displayName: "Password",
        value: "",
        placeholder: ""
    });

    public showPassword = new formattingSettings.ToggleSwitch({
        name: "showPassword",
        displayName: "Show Password",
        value: false
    });

    public savedPassword = new formattingSettings.TextInput({
        name: "savedPassword",
        displayName: "Saved Password",
        value: "",
        placeholder: ""
    });

    public name: string = "passwordSettings";
    public displayName: string = "Password Settings";
    public slices: Array<FormattingSettingsSlice> = [this.password, this.showPassword, this.savedPassword];
}

/**
 * Filter Settings Card
 */
class FilterSettingsCard extends FormattingSettingsCard {
    public organizationMapping = new formattingSettings.TextInput({
        name: "organizationMapping",
        displayName: "Organization Password Mapping",
        value: JSON.stringify({
            "FAO123": "FAO",
            "UNICEF123": "UNICEF",
            "UNHCR123": "UNHCR",
            "WHO123": "WHO",
            "WIPO123": "WIPO"
        }, null, 2),
        placeholder: '{"password1":"FAO","password2":"UNICEF"}'
    });

    public name: string = "filterSettings";
    public displayName: string = "Filter Settings";
    public slices: Array<FormattingSettingsSlice> = [this.organizationMapping];
}

/**
 * Visual formatting settings model
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    public general: GeneralSettingsCard = new GeneralSettingsCard();
    public passwordSettings: PasswordSettingsCard = new PasswordSettingsCard();
    public filterSettings: FilterSettingsCard = new FilterSettingsCard();
    public cards = [this.general, this.passwordSettings, this.filterSettings];
}

