# Telas de referência RASTREON

## Elementos permanentes

- Barra superior azul-marinho com logotipo completo, Histórico, Garagem, Comunidade e Perfil.
- Mapa claro ocupando o fundo da aplicação.
- Painel principal branco, centralizado e com cantos discretos.
- Indicador `Painel conectado` no canto superior direito.
- Cartão do veículo à esquerda, clima no rodapé e ferramentas do mapa na lateral direita.

## Histórico

- Cabeçalho `Relatório operacional` com filtros e exportação.
- Cinco indicadores: viagens, distância, horas rodadas, tempo parado e velocidade máxima.
- Traçado da última viagem, resumo, reprodução da rota, eventos, viagens recentes e conformidade.

## Garagem

- Veículo selecionado com os dados reais da conta; sem exemplo quando a garagem estiver vazia.
- Resumo da garagem, zona segura, dispositivos, alerta de velocidade e documentos.
- Ações de detalhes, troca, remoção, conexão do celular e inclusão de veículo.

## Comunidade

- Busca, abas autorizadas para a conta e quatro indicadores calculados pelas APIs.
- Ocorrências, parceiros, posts, conversas/PX, comboios e confiança/suporte.
- Estados vazios explícitos quando não houver conteúdo retornado pelas APIs.

## Dados

- Não usar números, placas, endereços, viagens, dispositivos, pessoas ou ocorrências fictícias.
- Não disponibilizar controles de simulação no dashboard de produção.
- Toda ação exibida deve chamar uma API real ou conduzir ao fluxo real de cadastro/configuração.
