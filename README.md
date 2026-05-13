# Processos Axenya

Plataforma interna para orquestrar análises recorrentes do time da Axenya com Claude.

Três entidades:
- **Skills** — lógica reutilizável (ex: "BAT cadastral") armazenada no DB com versionamento e log de edição.
- **Conectores** — integrações MCP (BigQuery do cliente etc.) com auth criptografada AES-GCM.
- **Processos** — Skill + Conectores + prompt customizado + inputs + trigger. Cada execução é registrada e exibida com timeline em tempo real.

Stack: Next.js 16 (App Router) + Supabase (Postgres + Auth + Realtime) + Anthropic SDK com MCP via API.

## Setup

### 1. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — do projeto Supabase (org `ypfgdqzcuelpgcumbbbd`).
- `ANTHROPIC_API_KEY` — sua chave da Anthropic.
- `SECRETS_ENCRYPTION_KEY` — gere com `openssl rand -base64 32`. **Não rotacione** sem migrar secrets existentes.
- `PLATFORM_SIGNING_SECRET` — qualquer string aleatória; protege endpoints internos.
- `NEXT_PUBLIC_APP_URL` — URL pública (em dev: `http://localhost:3000`).

### 2. Banco de dados

Aplique a migração inicial no Supabase:

```bash
# via Supabase CLI (recomendado)
supabase db push

# ou copie db/migrations/0001_init.sql e rode no SQL Editor do Supabase
```

A migração:
- Cria todas as tabelas (skills, conectores, processos, runs, etc.)
- Habilita RLS com política "qualquer usuário autenticado acessa tudo" (single-tenant Axenya)
- Habilita Supabase Realtime em `process_runs` e `run_steps` (necessário pra timeline live)
- Cria trigger que sincroniza `auth.users` → `public.user_profiles`

### 3. Auth do Supabase

Em **Authentication → Settings**:
- Email OTP habilitado (login via magic link)
- Site URL: `http://localhost:3000` (dev) ou seu domínio
- Redirect URLs: adicione `http://localhost:3000/auth/callback`

### 4. Rodar localmente

```bash
pnpm install
pnpm dev
```

Acesse `http://localhost:3000`, faça login com seu email, e crie sua primeira skill.

## Fluxo end-to-end (BAT cadastral Takoda)

1. **/clientes** — cadastre `Takoda`.
2. **/skills/new** — crie a skill `BAT cadastral` com o prompt da análise.
3. **/conectores/new** — cadastre o MCP do BigQuery da Takoda (URL + bearer token).
4. **/processos/new** — crie `BAT cadastral Takoda` apontando para a skill e o cliente.
5. Na página do processo, marque o conector MCP, escreva o prompt customizado (ex: "Rode pra Takoda considerando o dataset takoda_prod do mês X") e mude o status pra `active`.
6. Clique **▶ Rodar agora**. A UI navega para `/runs/[id]` mostrando a timeline em tempo real (mensagens do agente, chamadas MCP, resultados, custo).

## Arquitetura

```
Server Action runProcessoNow → enqueueProcessoRun → INSERT process_runs (status=queued + snapshot)
                                                          ↓
                                          fetch /api/runs/[id]/execute  (não-bloqueante)
                                                          ↓
                                                    executeRun(id)
                                                  /              \
                                  buildMcpServers()        composeSystemPrompt()
                                  (decripta secrets)
                                                          ↓
                                  anthropic.beta.messages.create({ mcp_servers, ...})
                                                          ↓ (loop multi-turn)
                                  StepWriter → INSERT run_steps  →  Supabase Realtime → UI
                                                          ↓
                                  UPDATE process_runs (status terminal + tokens + custo)
```

- **Snapshot de execução**: `process_runs.processo_snapshot` é uma cópia denormalizada do processo + conectores + skill content no momento do dispatch. Edições futuras não afetam runs antigos.
- **MCP via API**: a Anthropic gerencia a conexão MCP no servidor dela. Não rodamos cliente MCP no nosso runtime — passamos URL + token e a API faz o trabalho.
- **Secrets**: tokens de conector ficam em `conector_secrets.encrypted_payload` (AES-256-GCM). RLS bloqueia leitura pelo client; só service-role decripta em runtime.

## Fases

- **Fase 1**: MVP — CRUD + trigger manual + MCP conectores + dashboard de runs com timeline live. ✅
- **Fase 2**: Webhook (HMAC + idempotência), Cron mestre, notificação Slack. ✅
- **Fase 3 (atual)**: HTTP API conectores (com endpoints JSONSchema), encadeamento de processos. ✅
- **Fase 4**: Skill version pinning na UI, replay de runs, concurrency policies, budget cap, health check de MCP, dry run.

### Triggers (Fase 2)

Cada processo tem sempre um **trigger manual** (botão "Rodar agora"). Triggers adicionais:

- **Webhook** — gera URL pública única (`/api/triggers/webhook/[token]`). Validação opcional via HMAC SHA-256 no header `X-Axenya-Signature`. Suporta `Idempotency-Key` (dedup últimas 24h). Payload mapping com JSONPath simples (`$.field`) pra extrair inputs do body.
- **Cron** — expressão cron padrão com timezone. Vercel Cron mestre (`/api/cron/dispatch`) roda a cada minuto, avalia todos os triggers cron ativos e dispatcha os matches. Tabela `cron_dispatches` previne double-fire em retries.

Variáveis adicionais:
- `CRON_SECRET` — usado pelo Vercel Cron pra autenticar o dispatcher. Em local, use `PLATFORM_SIGNING_SECRET` no header `x-platform-signing-secret`.

### Slack (Fase 2)

- Cadastre destinos em `/settings/slack` colando uma Incoming Webhook URL do Slack (criar em api.slack.com/messaging/webhooks). URL é criptografada AES-GCM no banco.
- Cada processo pode escolher um destino na sua página. Quando o run termina (sucesso ou falha), o destino recebe uma mensagem com status, duração, custo, tokens e preview do output. Falhas no Slack não afetam o run.

### HTTP API conectores (Fase 3)

Além de MCPs, você pode cadastrar conectores tipo HTTP API. Em `/conectores/new` use a aba **HTTP API**:

- **Base URL** + **auth_type** (`bearer`, `basic`, `api_key_header`, `api_key_query`, `none`).
- **Endpoints**: lista JSON com `name`, `method`, `path`, `description`, `input_schema` (JSONSchema). Cada endpoint vira uma tool nativa do Anthropic com nome `<conector_slug>__<endpoint_name>`.
- Credenciais criptografadas (AES-GCM) na mesma tabela `conector_secrets` que os MCPs.

No runtime, quando o agente chama uma tool desse conector, o `executeRun` faz `fetch()` com auth, recebe a resposta e devolve como `tool_result` no próximo turno. GET/DELETE viram query string, POST/PUT/PATCH viram JSON body. Timeout de 30s por chamada.

### Encadeamento de processos (Fase 3)

Em qualquer processo, adicione um trigger **Encadeamento** apontando para um processo "pai" e a condição (`success`, `failure`, `any`). Quando o pai termina com a condição, o filho é disparado automaticamente:

- O output do pai (`output.text`) fica disponível ao filho como `inputs.parent_output_text`.
- `input_mapping` opcional aplica JSONPath ao output do pai pra extrair campos específicos.
- `parent_run_id` é gravado no run filho, e `chain_depth` é incrementado.
- Guardrail anti-ciclo: aborta se `chain_depth > 10`.

Detalhes completos em [docs/superpowers/specs](docs/superpowers/specs/) (em breve) ou no plano em `/Users/sophialapadula/.claude/plans/quero-que-voc-construa-tidy-flask.md`.

## Scripts

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # next lint
```
