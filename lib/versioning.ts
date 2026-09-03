export const VERSION_PATTERN = '[0-9]+(\\.[0-9]+){0,3}';
export function manualVersion(value: string) {
  const version = value.trim();
  if (
    !version ||
    version.length > 40 ||
    !new RegExp(`^${VERSION_PATTERN}$`).test(version)
  )
    throw new Error(
      'Use a version like 1.0 or 2.1.3 (up to four numeric parts, 40 characters maximum).',
    );
  return version;
}
export function incrementVersion(value: string) {
  const parts = value.split('.');
  if (parts.length < 2 || !parts.every((part) => /^\d+$/.test(part)))
    return `${value || '0'}.1`;
  parts[parts.length - 1] = String(BigInt(parts[parts.length - 1]) + BigInt(1));
  return parts.join('.');
}
