import type { SelectOption, SelectSection } from './select';

export type { SelectOption, SelectSection };

export interface SelectProps {
  label?: string;
  placeholder?: string;
  options?: SelectOption[];
  sections?: SelectSection[];
  value?: string | null;
  values?: string[];
  onChange?: (value: string) => void;
  onValuesChange?: (values: string[]) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  compact?: boolean;
  enhanced?: boolean;
  searchable?: boolean;
  multi?: boolean;
  variant?: 'default' | 'yearRange';
  startYear?: number | null;
  endYear?: number | null;
  onYearRangeChange?: (start: number | null, end: number | null) => void;
  /** Значение «не выбрано» для сброса и кнопки очистки. По умолчанию '0'. */
  emptyValue?: string;
  /** Куда сбрасывать одиночный select. По умолчанию = emptyValue. */
  resetValue?: string;
}
