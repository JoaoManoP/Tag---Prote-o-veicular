import { webLocalUrl } from '../services/runtimeUrl';

type MutableRuntime = typeof globalThis & { window?: unknown };

const runtime = globalThis as MutableRuntime;
const originalWindow = Object.getOwnPropertyDescriptor(runtime, 'window');

function setWindow(value: unknown) {
  Object.defineProperty(runtime, 'window', {
    configurable: true,
    writable: true,
    value
  });
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(runtime, 'window', originalWindow);
  else Reflect.deleteProperty(runtime, 'window');
});

describe('webLocalUrl', () => {
  it('preserva a URL no ambiente nativo sem window', () => {
    Reflect.deleteProperty(runtime, 'window');
    expect(webLocalUrl('https://protec.nexobg.com.br')).toBe('https://protec.nexobg.com.br');
  });

  it('nao falha quando o React Native expoe window sem location', () => {
    setWindow({});
    expect(webLocalUrl('https://protec.nexobg.com.br')).toBe('https://protec.nexobg.com.br');
  });

  it('adapta a URL local para o hostname usado pelo navegador', () => {
    setWindow({ location: { hostname: 'localhost' } });
    expect(webLocalUrl('http://192.168.1.10:3000')).toBe('http://localhost:3000');
  });

  it('preserva a URL fora de um navegador local', () => {
    setWindow({ location: { hostname: 'app.exemplo.com' } });
    expect(webLocalUrl('https://protec.nexobg.com.br')).toBe('https://protec.nexobg.com.br');
  });
});
