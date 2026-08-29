# RASTREON Mobile

Aplicativo nativo React Native, Expo e TypeScript. Ele consome o mesmo backend Express do site; não existe backend ou banco principal dentro de `frontend/mobile/`.

## Instalação

```powershell
copy .env.example .env
npm install
npm run check
```

Defina `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_SOCKET_URL` com a URL HTTPS/WSS alcançável pelo aparelho. Nenhum token privado de provider pode usar o prefixo `EXPO_PUBLIC_`.

## Development Build

```powershell
npx expo prebuild --platform android
npm run android
```

No macOS com Xcode, use `npm run ios`. Localização em segundo plano, câmera, notificações e comportamento com tela bloqueada exigem Development Build e aparelho físico; o Expo Go não representa esses recursos completamente.

### Android Studio no Windows

Mantenha o repositório em um caminho físico curto, por exemplo `C:\dev\rastreon`. Caminhos longos dentro do OneDrive podem ultrapassar o limite de 260 caracteres do Ninja/NDK e causar erros como `Filename longer than 260 characters` ou `build.ninja still dirty`.

Depois de gerar o projeto nativo, abra a pasta `frontend/mobile/android` no Android Studio. Use JDK 17, aguarde o Gradle Sync e execute o módulo `app`. Se uma compilação anterior foi interrompida, feche instâncias extras do Gradle antes de tentar novamente.

## Execução

Inicie primeiro o backend na raiz com `npm start`. Depois execute `npm start` nesta pasta e abra o Development Build. Em rede local, use o IPv4 do computador, não `localhost`.

## Testes

`npm run check` executa TypeScript estrito e testes Jest. Teste GPS negado, QR expirado, perda de internet, reconexão e background também em aparelhos Android/iOS reais antes de publicar.
