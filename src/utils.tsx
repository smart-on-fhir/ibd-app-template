
/**
 * Converts a date string into a more readable format.
 * @param dateStr - Any valid date string that can be parsed by the Date constructor.
 * @returns A locally formatted date string
 */
export function formatDate(
    dateStr: string,
    options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { year: options.year, month: options.month, day: options.day });
}
