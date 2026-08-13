export interface SelectOption {
  value: string;
  label: string;
  desc?: string;
  /** Предупреждение для опции (иконка + текст, красная метка) */
  warning?: string;
  disabled?: boolean;
}

export interface SelectSection {
  title?: string;
  options: SelectOption[];
}
