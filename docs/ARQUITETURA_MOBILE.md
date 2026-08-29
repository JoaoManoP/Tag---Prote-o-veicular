# Arquitetura mobile do RASTREON

O cliente nativo está implementado em `frontend/mobile/` com React Native, Expo Router e TypeScript. Ele reutiliza o backend Express/Socket.IO da aplicação web e não contém WebView, servidor próprio ou banco principal independente.

Consulte:

- `MOBILE_ARCHITECTURE.md` para camadas e responsabilidades;
- `MOBILE_FEATURES.md` para módulos e limitações externas;
- `MOBILE_SECURITY.md` para consentimento, tokens e ownership;
- `MOBILE_TESTING.md` para validações automáticas e em aparelho físico;
- `../frontend/mobile/README.md` para Android, iOS e Development Build.
