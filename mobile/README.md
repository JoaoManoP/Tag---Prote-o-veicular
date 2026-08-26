# RASTREON Mobile

Aplicativo nativo React Native, Expo e TypeScript. Ele consome o mesmo backend Express do site; não existe backend ou banco principal dentro de `mobile/`.

## Instalação

```powershell
copy .env.example .env
npm install
npm run check
```

Defina `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_SOCKET_URL` com a URL HTTPS/WSS alcançável pelo aparelho. Nenhum token privado de provider pode usar o prefixo `EXPO_PUBLIC_`.

## Development Build

```powershell
npx expo prebuild
npm run android
```

No macOS com Xcode, use `npm run ios`. Localização em segundo plano, câmera, notificações e comportamento com tela bloqueada exigem Development Build e aparelho físico; o Expo Go não representa esses recursos completamente.

## Execução

Inicie primeiro o backend na raiz com `npm start`. Depois execute `npm start` nesta pasta e abra o Development Build. Em rede local, use o IPv4 do computador, não `localhost`.

## Testes

`npm run check` executa TypeScript estrito e testes Jest. Teste GPS negado, QR expirado, perda de internet, reconexão e background também em aparelhos Android/iOS reais antes de publicar.
