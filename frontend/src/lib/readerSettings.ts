export type SettingsMap = Record<string, unknown>;

export const readerSettingKeys = new Set([
  "readerMode",
  "readerTwoPageSpread",
  "readerPageMarginEnabled",
  "readerPageMarginPercent",
  "readerScreenPicNumberForLandscape",
  "readerScreenPicNumberForPortrait",
  "enableTapToTurnPages",
  "reverseTapToTurnPages",
  "enablePageAnimation",
  "flashWhiteScreenOnPageTurn",
  "autoPageTurningInterval",
  "showSingleImageOnFirstPage",
  "readerScrollSpeed",
  "enableDoubleTapToZoom",
  "enableLongPressToZoom",
  "longPressZoomPosition",
  "limitImageWidth",
  "enableTurnPageByVolumeKey",
  "enableClockAndBatteryInfoInReader",
  "showSystemStatusBar",
  "quickCollectImage",
  "preloadImageCount",
  "serverPrefetchImageCount",
  "showPageNumberInReader",
  "removeReadLaterOnComplete",
  "showChapterComments",
  "showChapterCommentsAtEnd",
  "hideDuplicateChapters",
  "readerBackground",
  "readerNightMode",
  "readerNightModeIntensity",
  "readerOrientationBehavior",
  "rememberReaderOrientation",
  "rememberReaderOrientationPerComic",
]);

function asMap(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function comicSettingsKey(comicId: string, sourceKey: string): string {
  return `${comicId}@${sourceKey}`;
}

export function getDeviceId(): string {
  const storageKey = "venera.deviceId";
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return "web-default";
  }
}

export function comicSpecificEntry(
  settings: SettingsMap,
  comicKey: string,
): Record<string, unknown> {
  return asMap(asMap(settings.comicSpecificSettings)[comicKey]);
}

export function isComicSpecificEnabled(
  settings: SettingsMap,
  comicKey: string,
): boolean {
  return comicSpecificEntry(settings, comicKey).enabled === true;
}

export function deviceSpecificEntry(
  settings: SettingsMap,
  deviceId: string,
): Record<string, unknown> {
  return asMap(asMap(settings.deviceSpecificSettings)[deviceId]);
}

export function isDeviceSpecificEnabled(
  settings: SettingsMap,
  deviceId: string,
): boolean {
  return deviceSpecificEntry(settings, deviceId).enabled === true;
}

/** Comic-specific overrides win over the current browser's overrides. */
export function effectiveReaderSettings(
  settings: SettingsMap,
  comicKey: string,
  deviceId: string,
): SettingsMap {
  const result: SettingsMap = { ...settings };
  if (isDeviceSpecificEnabled(settings, deviceId)) {
    const device = deviceSpecificEntry(settings, deviceId);
    for (const key of readerSettingKeys) {
      if (device[key] !== undefined) result[key] = device[key];
    }
  }
  if (isComicSpecificEnabled(settings, comicKey)) {
    const comic = comicSpecificEntry(settings, comicKey);
    for (const key of readerSettingKeys) {
      if (comic[key] !== undefined) result[key] = comic[key];
    }
  }
  return result;
}

export function withComicSpecificSetting(
  settings: SettingsMap,
  comicKey: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const map = asMap(settings.comicSpecificSettings);
  return {
    ...map,
    [comicKey]: { ...asMap(map[comicKey]), [key]: value },
  };
}

export function withoutComicSpecificSettings(
  settings: SettingsMap,
  comicKey: string,
): Record<string, unknown> {
  const map = { ...asMap(settings.comicSpecificSettings) };
  delete map[comicKey];
  return map;
}

export function withDeviceSpecificSetting(
  settings: SettingsMap,
  deviceId: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const map = asMap(settings.deviceSpecificSettings);
  return {
    ...map,
    [deviceId]: { ...asMap(map[deviceId]), [key]: value },
  };
}

export function withoutDeviceSpecificSettings(
  settings: SettingsMap,
  deviceId: string,
): Record<string, unknown> {
  const map = { ...asMap(settings.deviceSpecificSettings) };
  delete map[deviceId];
  return map;
}
