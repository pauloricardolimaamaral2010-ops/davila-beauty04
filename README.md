# Davila Beauty — agendamento online

Site do studio com duas partes:

- **Página de agendamento** (`/`) — o link que vai na bio do Instagram. O cliente escolhe serviço, dia e horário, deixa nome e WhatsApp, e o horário cai na agenda na hora.
- **Painel da dona** (`/painel`) — protegido por senha. Mostra os números do dia/semana/faturamento previsto, agenda por dia, e permite confirmar, concluir, cancelar, chamar no WhatsApp e excluir agendamentos.

O site funciona sem internet: fontes, estilos e imagens estão integrados (`.ttf` + `style.css` locais), acessíveis pelo IP da rede local ou pela internet.

## Rodando localmente

```powershell
cd C:\Users\paulo\BloxBot\davila-beauty
pip install -r requirements.txt
python app.py
```

O servidor escuta na porta 5000 (IP da rede local e `localhost`):

- Agendamento: http://127.0.0.1:5000
- Painel: http://127.0.0.1:5000/painel

## Acesso por outros dispositivos na mesma rede Wi-Fi

- IP do computador: **192.168.5.100** (veja como descobrir abaixo).
- URLs para compartilhar:
  - Agendamento: **http://192.168.5.100:5000/**
  - Painel da dona: **http://192.168.5.100:5000/painel**

### Como descobrir o endereço IP da rede (para celulares, tablets e outros notebooks)

Em PowerShell:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq "Wi-Fi" } | Select-Object IPAddress
```

Ou digite `ipconfig` no terminal e copie o IPv4 da entrada **Wi-Fi**.

Testes úteis (no PC):

```powershell
Test-NetConnection -ComputerName 192.168.5.100 -Port 5000
Invoke-WebRequest "http://192.168.5.100:5000/" -UseBasicParsing
```

Se a porta estiver fechada, abra a porta na rede e no Windows:

```powershell
New-NetFirewallRule -DisplayName "DavilaBeauty-5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

## Como executar

- Local: `python app.py` ou `iniciar.bat`.
- Instalar dependências: `pip install -r requirements.txt`.
- Ambiente de desenvolvimento: variável `FLASK_DEBUG=1`.

## Banco de dados

- **Padrão:** SQLite (arquivo `instance/davila.db`). Dados persistem no arquivo; ideal para uso local/estável.
- **Produção (recomendado):** PostgreSQL via `DATABASE_URL`, ex.:
  ```
  DATABASE_URL=postgresql://usuario:senha@host:5432/dbname
  ```
  O app cria a tabela automaticamente. A porta do PostgreSQL (5432) precisa estar aberta.
  Recomendadas: **Neon (free)**, **Supabase (free)**, ou uma VPS com PostgreSQL.

## Monitoramento e saúde

- Health check: **`/healthz`** — responde `200 {"status":"ok",...}` se o banco está respondendo.
- Logs do servidor: `instance/server.log` (log do Python).
- Log de erros não tratados: cai em `instance/server.log` com stack trace (via `@app.errorhandler(500)`).

## Publicar na internet (site profissional, 24h)

> **Nota de honestidade:** não tenho conta ou credencial de nenhuma hospedagem, então não posso publicar ou testar um link público neste momento. Abaixo está o pacote completo pronto para publicação.

Sobre "gratuito e ilimitado": é impossível prometer "gratuito e ilimitado". Explico o que existe de real:
- **Render Free** — o app roda enquanto o Render mantiver o serviço up; **não é garantia de 24h/7** (sem SLA). Para produção estável, use plano pago (Render ~7 USD/mês, Railway similar).
- **PostgreSQL grátis do Render** — existe (adiciona no dashboard do blueprint); serve para a indepressão.

### Render — Deploy um clique (Blueprint)

O `render.yaml` desta pasta é um blueprint completo — você não toca em comandos, só puxa no dashboard:

1. Crie um repositório (GitHub/GitLab) com a pasta `davila-beauty`.
2. No Render → Dashboard → **Blueprints → New Blueprint Instance** → seleciona o repositório.
3. Nomeie (ex.: `DavilaBeauty`) → clique em **Apply**.
4. O site fica em `https://<seunome>.onrender.com` — quando terminar o deploy, testa agendamento + login no painel.
5. Variáveis já configuradas: `PANEL_SENHA` (troque o padrão `davila` ANTES de publicar), `SECRET_KEY` (gerada) e `DATABASE_URL` (do PostgreSQL do blueprint).

### Passos rápidos (Render, sem blueprint)

Você pode ir direto sem `render.yaml`:
1. Crie uma conta no [render.com](https://render.com).
2. "New Web Service" → seleciona o repositório.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT`
5. Variáveis de ambiente: `PANEL_SENHA` (troque o padrão `davila` antes de publicar!), `DATABASE_URL` (opcional; PostgreSQL do Render ou Neon/Supabase).
6. Deploy: `https://seunome.onrender.com` — Render gera HTTPS automaticamente.

### Alternativas simples

- **Railway:** similar ao Render (inclui painel para ver logs + variáveis de ambiente).
- **Fly.io:** use `fly.toml` (`fly launch` / `fly deploy`) — URL em `<app>.fly.dev`, HTTPS automático.
- **VPS:** siga "Rodando localmente" + configure Nginx proxy reverso + Let's Encrypt; o app funciona como serviço.

### Sobre o Render no lugar do PC

Quando o app mora no Render:
- **Você não precisa do PC ligado** — a URL `https://<seunome>.onrender.com` abre de qualquer lugar, qualquer hora.
- **Sem preocupação com suspensão** — o plano Free do Render mantém serviços funcionando; o PostgreSQL gratuito também está disponível.

### Security

- TLS: Render/Railway/Fly dão HTTPS automaticamente.
- Sessões: cookies com `HttpOnly`, `SameSite=Lax`, período de 30 dias.
- `PANEL_SENHA`: troque o valor padrão antes de publicar.
- Não exponha `SECRET_KEY` no repo — aplicar via variável de ambiente.

### Funcionamento contínuo

- Render/Railway: restart automático, rollback, health checks — 24h OK.
- Cron/scripts: use um serviço de tarefas automáticas para reiniciar se o processo morrer; para VPS use `systemd` ou `supervisord`.
- Checagem de saúde: aponte o `/healthz` para seu monitor (Synthetic / UptimeRobot / etc.).

### O que dizer para quem use o link público

> Site público: `https://seu-link.render.com/` (agendamento) e `https://seu-link.render.com/painel` (painel da dona). Site no ar, 24h, HTTPS por conta da hospedagem.

## Funcionalidades atuais (não removidas)

- Página de agendamento com horários livres, duração e preços (3 serviços: Design personalizado, Design com henna, Cílios volume brasileiro).
- Cliente de celular/desktop/tablet agora abre o site de forma responsiva.
- Agendamento guardado no SQLite/PostgreSQL, aparece na agenda do painel (filtrado por Hoje/Amanhã/7 dias/Todas).
- Painel: resumo do dia, grupos por dia, busca, filtros, ações de confirmar/concluir/cancelar/chamar no WhatsApp/excluir.
- Login do painel com PIN (`PANEL_SENHA`, padrão `davila`).
- Assets locais: fontes Cormorant Garamond + Jost (`.ttf`) — sem dependência externa.
- Favorable a conexões externas: binds `0.0.0.0` e `::1`, portas 5000.
- Excedente: `/healthz`, `instance/server.log`, `errorhandler(500)`.

## Arquivos da árvore

```
davila-beauty/
├── app.py              # app Flask completo
├── Dockerfile          # para déploy em Docker/Fly
├── fly.toml            # exemplo Fly.io
├── Procfile            # Render/Railway
├── README.md
├── requirements.txt
├── instance/
│   ├── davila.db       # SQLite (padrão)
│   ├── secret_key
│   └── server.log      # log do servidor + erros
├── static/
│   ├── css/{style,fonts}.css
│   ├── fonts/*.ttf     # Cormorant Garamond + Jost baixados
│   ├── js/{booking,panel}.js
│   └── img/favicon.svg
└── templates/
    ├── index.html, painel.html, login.html
    └── (design e fontes em css/static)
```
