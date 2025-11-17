import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.Card;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
declare class GeneralSettingsCard extends FormattingSettingsCard {
    title: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class PasswordSettingsCard extends FormattingSettingsCard {
    password: formattingSettings.TextInput;
    showPassword: formattingSettings.ToggleSwitch;
    savedPassword: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class FilterSettingsCard extends FormattingSettingsCard {
    organizationMapping: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
export declare class VisualFormattingSettingsModel extends FormattingSettingsModel {
    general: GeneralSettingsCard;
    passwordSettings: PasswordSettingsCard;
    filterSettings: FilterSettingsCard;
    cards: (GeneralSettingsCard | PasswordSettingsCard | FilterSettingsCard)[];
}
export {};
