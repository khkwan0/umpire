# UMPIRE Agent CLI

Interactive AI agent for UMPIRE monitoring. Uses an LLM with tool calling to query live status, incidents, targets, and the full HTTP API.

## Install

```bash
cd agent
npm install
npm run build
```

## Configure

### LLM (required for CLI; web uses Settings → AI Agent or env)

**OpenAI-compatible** (default):

```bash
export OPENAI_API_KEY=sk-…
export OPENAI_MODEL=gpt-4o-mini          # optional
export OPENAI_BASE_URL=https://api.openai.com/v1  # optional
```

**Anthropic**:

```bash
export AGENT_LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-…
export ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

**Ollama** (OpenAI-compatible):

```bash
export AGENT_LLM_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export OLLAMA_MODEL=llama3.2
```

**vLLM**:

```bash
export AGENT_LLM_PROVIDER=vllm
export VLLM_BASE_URL=http://127.0.0.1:8000/v1
export VLLM_MODEL=your-model
export VLLM_API_KEY=optional
```

For the web UI, prefer **Settings → AI Agent** (stored in the database). Environment variables are used when no saved settings exist.

### UMPIRE API

```bash
export UMPIRE_BASE_URL=http://localhost:8089
export UMPIRE_API_TOKEN=umpire_…   # when auth is enabled
```

## Run

```bash
npm start          # interactive chat
npm run dev        # same via tsx
umpire-agent status
```

## Web UI

The web chat at **Agent** in the UMPIRE UI uses the same agent via WebSocket (`/api/agent/ws`). Configure the LLM under **Settings → AI Agent**, or set environment variables on the API server.

See [docs/core.md](../docs/core.md#mcp-agents).
