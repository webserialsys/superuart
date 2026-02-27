export const UART_BAUDRATE_OPTIONS = ["9600", "19200", "38400", "57600", "115200"] as const;
export const DEFAULT_UART_BAUDRATE = "115200";

export function normalizeBaudrate(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_UART_BAUDRATE;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return DEFAULT_UART_BAUDRATE;
  }

  return /^[0-9]+$/.test(trimmedValue) ? trimmedValue : DEFAULT_UART_BAUDRATE;
}

export function getBaudrateOptions(currentValue?: string | null): string[] {
  const options = new Set<string>(UART_BAUDRATE_OPTIONS);
  const normalizedCurrentValue = normalizeBaudrate(currentValue);
  options.add(normalizedCurrentValue);

  return [...options].sort((left, right) => Number(left) - Number(right));
}
