# Checklist do prompt mestre

| Área | Estado | Observação |
|---|---|---|
| Mapa 2D/3D, prédios, câmera e fallback | Implementado | Relevo depende de fonte raster-dem compatível |
| Veículo 3D e posição atual limpa | Implementado | Trilha ao vivo removida; histórico preservado |
| Busca, rota, ETA, paradas e POIs | Implementado | Photon, OSRM/Google e Overpass |
| Trânsito | Condicional | Google licenciado ou relatos comunitários não oficiais |
| Histórico, distância e tempo filtrados | Implementado | GPS bruto não é reescrito |
| Postos, preços, parceiros e favoritos | Implementado | Preço comunitário passa por revisão |
| Comentários, avaliações, fotos e denúncias | Implementado | Feature flag e moderação |
| Conversas privadas, consentimento e bloqueio | Implementado | Sem exposição de contato/localização |
| PX e ocorrências temporárias | Implementado | Filtro contra telefone/e-mail e expiração |
| Notificações e preferências | Implementado internamente | Push externo exige credenciais |
| Admin, auditoria, RBAC e 2FA | Implementado | 2FA obrigatório para escrita privilegiada em produção |
| Mobile | Implementado no projeto | Lojas bloqueadas até migração Expo 57 e field test |
| Traccar/J16 | Integração implementada | Homologação física externa pendente |
| Bloqueio remoto | Indisponível por segurança | Não simulado |
| Testes automatizados | 129 aprovados | Resultado de 25/08/2026 |

“Condicional” e “pendente externa” não significam dado falso: a interface informa a indisponibilidade e mantém alternativa segura.
