# Arquitetura mobile do RASTREON

O aplicativo em `frontend/mobile/` é React Native/Expo e não usa WebView. Web e app compartilham o Express, Socket.IO e SQLite existentes. O servidor é a fonte de verdade; armazenamento local contém somente tema, cache, credencial temporária protegida e fila GPS offline.

Camadas: rotas Expo Router, componentes reutilizáveis, contexto de sessão, cliente HTTP, SocketService, LocationService, SyncService e fila persistente. Providers privados permanecem no backend.
