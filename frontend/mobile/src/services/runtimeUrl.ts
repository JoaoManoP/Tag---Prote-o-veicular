type BrowserRuntime = typeof globalThis & {
  window?: {
    location?: {
      hostname?: string;
    };
  };
};

export function webLocalUrl(configuredUrl: string) {
  const browserHost = (globalThis as BrowserRuntime).window?.location?.hostname;
  if (browserHost !== 'localhost' && browserHost !== '127.0.0.1') return configuredUrl;

  try {
    const url = new URL(configuredUrl);
    url.hostname = browserHost;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredUrl;
  }
}
