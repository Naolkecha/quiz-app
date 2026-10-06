export async function readRawInitData(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const { init, retrieveRawInitData } = await import("@telegram-apps/sdk");
    init();
    const raw = retrieveRawInitData();
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}
