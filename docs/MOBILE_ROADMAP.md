# Roadmap mobile

O celular atual é o rastreador demonstrativo do veículo selecionado. A API foi preparada para manter o mesmo contrato quando houver aplicativo dedicado ou tag física.

## Próximos passos

1. Extrair um cliente de telemetria reutilizável com `deviceId`, `sequence`, timestamp e consentimento.
2. Autenticar dispositivos com credenciais revogáveis diferentes da sessão web.
3. Manter IndexedDB no PWA e usar armazenamento seguro nativo no aplicativo.
4. Implementar envio em background respeitando as limitações de Android e iOS.
5. Incluir pinning, rotação de credenciais, revogação e trilha de auditoria.
6. Manter pontos GPS brutos separados de map matching e reconstruções.
7. Adicionar notificações somente após consentimento e infraestrutura apropriada.

Não existe captura silenciosa: compartilhamento depende de ação e permissão explícitas do usuário.
