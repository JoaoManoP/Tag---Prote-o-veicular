# Problemas conhecidos

## Alto

- `[!]` VPS real, processo Node, banco e backups ainda não foram auditados por falta de acesso.
- `[!]` GPS em background e Navigation SDK dependem de aplicativo nativo e credenciais externas.
- `[!]` Consulta de placa não pode ser validada sem token/contrato do provider.

## Médio

- `[~]` Voz, paradas e rerouting estão implementados, mas ainda dependem de teste em deslocamento físico.
- `[~]` OSRM padrão não fornece trânsito ao vivo nem preço de pedágio.
- `[~]` Overpass público precisa ser substituído ou operado de forma controlada em escala.
- `[~]` Map matching continua como adapter indisponível.
- `[~]` Retenção por sessão e exclusão LGPD estão implementadas; os prazos jurídicos de alertas e auditoria ainda precisam ser aprovados.
- `[~]` O navegador visual não estava conectado nesta auditoria; contratos DOM passaram, mas o teste visual manual continua pendente.
- `[~]` A reprodução de histórico foi validada por contrato e testes automatizados, mas ainda requer inspeção visual em navegador real.

## Baixo

- `[~]` `frontend/client/dist` é um artefato legado sem fonte/build associado confirmado.
- `[~]` Arquivos locais de runtime existem no workspace, embora ignorados pelo Git.
- `[~]` Alguns documentos históricos ainda usam o nome antigo; a identidade atual do produto é Rastreon.
