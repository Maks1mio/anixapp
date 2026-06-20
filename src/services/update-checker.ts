export interface UpdateInfo {
  version: string;
  url: string;
  body: string | null;
}

/** При ошибке (404, сеть, неверный JSON) возвращаем null — обновление не показываем. */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  if (!window.electron?.checkForUpdate) return null;
  try {
    return await window.electron.checkForUpdate(currentVersion);
  } catch {
    return null;
  }
}
