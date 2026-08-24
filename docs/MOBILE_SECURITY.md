# Segurança mobile

- tokens Falcon, mapas privados e outros providers nunca entram no bundle;
- sessão e ownership são validados pelo backend;
- credencial do rastreador fica no SecureStore;
- QR é temporário, revogável, imprevisível e de uso único;
- GPS depende de consentimento explícito e pode ser interrompido;
- fila offline não armazena senha nem segredo de provider;
- produção requer HTTPS/WSS e testes em aparelho físico.
