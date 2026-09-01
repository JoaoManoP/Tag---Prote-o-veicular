# RASTREON Mobile

Aplicativo nativo React Native, Expo e TypeScript. Ele consome o mesmo backend Express do site; não existe backend ou banco principal dentro de `frontend/mobile/`.

## Instalação

```powershell
copy .env.example .env
npm install
npm run check
```

Defina `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_SOCKET_URL` com a URL HTTPS/WSS alcançável pelo aparelho. Nenhum token privado de provider pode usar o prefixo `EXPO_PUBLIC_`.

## Desenvolvimento

```powershell
npx expo prebuild --platform android
npm run android
```

No macOS com Xcode, use `npm run ios`. Localização em segundo plano, câmera, notificações e comportamento com tela bloqueada devem ser testados em aparelho físico.

## APK independente para Android

A build `release` inclui o JavaScript e os recursos dentro do APK. Ela não depende do Expo Go, Metro, Android Studio ou de um computador depois de instalada.

Crie `android/keystore.properties` apontando para uma chave privada fora do Git e defina as URLs públicas durante a compilação:

```powershell
$env:EXPO_PUBLIC_API_URL='https://protec.nexobg.com.br'
$env:EXPO_PUBLIC_SOCKET_URL='https://protec.nexobg.com.br'
npm run android:release
```

O APK será gerado em `android/app/build/outputs/apk/release/app-release.apk`. Preserve a chave e as senhas usadas: atualizações futuras precisam da mesma assinatura.

### Android Studio no Windows

Mantenha o repositório em um caminho físico curto, por exemplo `C:\dev\rastreon`. Caminhos longos dentro do OneDrive podem ultrapassar o limite de 260 caracteres do Ninja/NDK e causar erros como `Filename longer than 260 characters` ou `build.ninja still dirty`.

Depois de gerar o projeto nativo, abra a pasta `frontend/mobile/android` no Android Studio. Use JDK 17, aguarde o Gradle Sync e execute o módulo `app`. Se uma compilação anterior foi interrompida, feche instâncias extras do Gradle antes de tentar novamente.

## Execução

Inicie primeiro o backend na raiz com `npm start`. Depois execute `npm start` nesta pasta e abra o Development Build. Em rede local, use o IPv4 do computador, não `localhost`.

## Testes

`npm run check` executa TypeScript estrito e testes Jest. Teste GPS negado, QR expirado, perda de internet, reconexão e background também em aparelhos Android/iOS reais antes de publicar.
