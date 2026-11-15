"""Configuração da API lida de variáveis de ambiente (nenhum segredo no código)."""
import os
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./patio.db")

# Chave exigida nos POSTs de ingestão (robô, visão, RPA). Vazia = modo dev, sem exigência.
INGEST_API_KEY = os.getenv("INGEST_API_KEY", "")

# Serviço de GenAI. Vazio = a API responde com o fallback de regras do POP simulado.
ASSISTENTE_URL = os.getenv("ASSISTENTE_URL", "")
ASSISTENTE_TIMEOUT_S = float(os.getenv("ASSISTENTE_TIMEOUT_S", "20"))

# Popula o banco com dados de demonstração e move os ônibus simulados.
DEMO = os.getenv("DEMO", "true").lower() == "true"
DEMO_INTERVALO_S = float(os.getenv("DEMO_INTERVALO_S", "6"))

_raiz_pacote = Path(__file__).resolve().parents[1]

# Export da tabela Ouro (fato_permanencia) baixado do Databricks.
# No App Service o pacote leva data/ ao lado de app/; no repositório, data/ fica na raiz (dois níveis acima).
_ouro_rel = Path("data") / "ouro" / "fato_permanencia.csv"
OURO_CSV = Path(os.getenv("OURO_CSV", str(next(
    (p for p in (_raiz_pacote / _ouro_rel, _raiz_pacote.parent / _ouro_rel) if p.exists()), _raiz_pacote.parent / _ouro_rel))))

# Pasta do front estático. No App Service o pacote leva front/ ao lado de app/; no Docker o nginx serve o front.
FRONT_DIR = Path(os.getenv("FRONT_DIR", str(next(
    (p for p in (_raiz_pacote / "front", _raiz_pacote.parent / "front") if p.is_dir()), _raiz_pacote / "front"))))

# Token exigido em /metrics (Prometheus local lendo o MVP publicado). Vazio = /metrics aberto (uso local/compose).
METRICS_TOKEN = os.getenv("METRICS_TOKEN", "")

CORS_ORIGINS =[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
