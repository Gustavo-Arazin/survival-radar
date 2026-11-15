# Survival Radar

App web que, para qualquer endereço do Brasil, mostra:

- **Serviços de emergência mais próximos:** hospitais, UPA/pronto atendimento, bombeiros, polícia, ambulâncias, abrigos, farmácias e postos, com rota no Google Maps (carro ou a pé) e no Waze.
- **Exposição a riscos:** infraestrutura crítica no entorno (refinarias, indústria química, depósitos e dutos de combustível, usinas, subestações, aeroportos, áreas militares, barragens) e relevo (ponto baixo sujeito a alagamento).
- **Ações recomendadas**, ajustadas ao perfil da família.

## Princípios

- **Sem servidor e sem conta.** Nada é armazenado fora do aparelho de quem usa. Os locais salvos e o perfil ficam no `localStorage` do navegador.
- **Funciona offline** depois da primeira consulta (service worker + locais salvos).
- **Regras determinísticas e auditáveis** em `rules.js`. A IA entra como camada opcional, por cima.

## Fontes

| Dado | Fonte | Momento |
| --- | --- | --- |
| Endereço → coordenada | Nominatim (OpenStreetMap) | Na consulta, pelo navegador |
| Serviços e infraestrutura | Overpass (OpenStreetMap) | Na consulta, pelo navegador |
| Altitude | Open-Meteo Elevation | Na consulta, pelo navegador |
| Mapa | tile.openstreetmap.org | Na consulta, com cache local |

## Limites conhecidos

- Distâncias em linha reta. O tempo real de trajeto aparece no Google Maps ou no Waze.
- O OpenStreetMap não informa se um hospital tem pronto-socorro 24 h ou atendimento pediátrico.
- Áreas oficiais de risco (SGB/Defesa Civil), CNES e barragens do SNISB ainda não integradas (próxima versão, pré-processadas).
- As regras de exposição são heurísticas de planejamento, não laudo técnico.

## Rodar localmente

Qualquer servidor estático: `python3 -m http.server 8080` e abrir `http://localhost:8080`.

## Testes

`node test/rules.test.js`
