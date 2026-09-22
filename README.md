# Lambda-Flow

Sistema web para organizar rotas diárias de motoboys, com ordenação automática a partir do ponto de partida, atribuição de responsável, total de km e links para **Google Maps** e **Waze**.

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço do Vite (geralmente `http://localhost:5173`).

## Acesso admin

Clique **5 vezes** no logo (badge) no topo do site. O modo admin fica ativo só na sessão do navegador.

## O que a v1 faz

- Seleção do dia da semana
- Cadastro de motoboys
- Inserção em lote de endereços (um por linha)
- Geocoding via OpenStreetMap Nominatim
- Ordenação automática (nearest-neighbor + 2-opt)
- Total estimado de km (Haversine)
- Link da rota completa no Google Maps
- Links Waze por parada

## Marca

Visual baseado no pacote **lambda-strike** (`#38E8FF`, `#031018`, Orbitron / Manrope).

## Observação sobre Waze / Maps

O Waze não oferece API pública completa de roteamento multi-parada. A v1 otimiza a ordem localmente e gera deep links para navegação. Em versões futuras dá para plugar Google Directions / Distance Matrix com API key para km de rua e otimização oficial.
