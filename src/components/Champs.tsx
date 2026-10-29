import { DateInput } from "@mantine/dates";
import { lireDate } from "../lib/dates";

/** Champ date français, effaçable ; se saisit aussi au clavier (« 14/03/2025 »). */
export function ChampDate(props: {
  label: string;
  description?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  required?: boolean;
  clearable?: boolean;
  minDate?: string;
  "data-autofocus"?: boolean;
}) {
  const { clearable = !props.required, ...reste } = props;
  return <DateInput {...reste} valueFormat="DD/MM/YYYY" placeholder="jj/mm/aaaa" dateParser={lireDate} clearable={clearable} />;
}
