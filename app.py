"""Davila Beauty — agendamento online + painel da dona."""

from __future__ import annotations

import logging
import os
import secrets
import sqlite3
import threading
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, render_template, request, session, url_for

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = INSTANCE_DIR / "davila.db"
LOG_PATH = INSTANCE_DIR / "server.log"
DATABASE_URL = os.environ.get("DATABASE_URL")

OPEN_MINUTES = 9 * 60
CLOSE_MINUTES = 12 * 60
SLOT_STEP = 30
CLOSED_WEEKDAYS = {6}  # domingo
DAYS_AHEAD = 14

STUDIO = {
    "nome": "Davila Beauty",
    "assinatura": "Studio de sobrancelhas",
    "telefone": "(63) 99268-7247",
    "endereco": "Rua Mato Grosso, 125 · Setor Vila Nova",
    "instagram": "@davilabeauty",
    "horario": "Seg a Sab · Até as 12h",
}

SERVICOS = [
    {
        "id": "personalizado",
        "nome": "Design personalizado",
        "descricao": "Mapeamento personalizado e acabamento completo",
        "preco": 40.0,
        "duracao": 30,
        "destaque": False,
    },
    {
        "id": "henna",
        "nome": "Design com henna",
        "descricao": "Preenchimento com henna durável",
        "preco": 50.0,
        "duracao": 45,
        "destaque": True,
    },
    {
        "id": "volume",
        "nome": "Cílios volume brasileiro",
        "descricao": "Laminação densa e alongada para volume",
        "preco": 120.0,
        "duracao": 90,
        "destaque": False,
    },
]

SERVICO_POR_ID = {servico["id"]: servico for servico in SERVICOS}
STATUSES = {"pendente", "confirmado", "concluido", "cancelado"}

# O studio trabalha no horário de Brasília, mesmo se o servidor estiver em UTC.
FUSO_STUDIO = timezone(timedelta(hours=-3))


def agora() -> datetime:
    return datetime.now(FUSO_STUDIO)


def dia_de_hoje() -> date:
    return agora().date()

DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    servico TEXT NOT NULL,
    data TEXT NOT NULL,
    hora TEXT NOT NULL,
    obs TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL
);
"""

SCHEMA_PG = """
CREATE TABLE IF NOT EXISTS agendamentos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    servico TEXT NOT NULL,
    data TEXT NOT NULL,
    hora TEXT NOT NULL,
    obs TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL
);
"""


class CursorWrapper:
    """Envolve um cursor sqlite3 ou psycopg2, unificando a API que o app usa."""

    def __init__(self, engine: str, cursor):
        self.engine = engine
        self._cursor = cursor
        self.rowcount = cursor.rowcount
        self.lastrowid = None

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()


class ConnWrapper:
    """Camada fina que esconde as diferenças entre SQLite e PostgreSQL."""

    def __init__(self, engine: str, conn):
        self.engine = engine
        self.conn = conn

    def execute(self, sql: str, params=()):
        if self.engine == "postgres":
            from psycopg2.extras import RealDictCursor

            sql = sql.replace("?", "%s")
            if sql.lstrip().upper().startswith("INSERT"):
                sql = sql + " RETURNING id"
            cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(sql, params)
            wrapper = CursorWrapper("postgres", cursor)
            if sql.lstrip().upper().startswith("INSERT"):
                row = cursor.fetchone()
                wrapper.lastrowid = row["id"] if row is not None else None
            return wrapper
        wrapper = CursorWrapper("sqlite", self.conn.execute(sql, params))
        wrapper.lastrowid = wrapper._cursor.lastrowid
        return wrapper

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def _connect():
    if DATABASE_URL:
        import psycopg2

        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        return "postgres", conn
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return "sqlite", conn


app = Flask(__name__)


def carregar_segredo() -> str:
    INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
    caminho = INSTANCE_DIR / "secret_key"
    if caminho.exists():
        valor = caminho.read_text(encoding="utf-8").strip()
        if valor:
            return valor
    valor = secrets.token_hex(32)
    caminho.write_text(valor, encoding="utf-8")
    return valor


PANEL_SENHA = os.environ.get("PANEL_SENHA", "davila")

app.secret_key = os.environ.get("SECRET_KEY") or carregar_segredo()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)


def get_db():
    if "db" not in g:
        g.db = ConnWrapper(*_connect())
    return g.db


@app.teardown_appcontext
def fechar_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    engine, conn = _connect()
    try:
        if engine == "postgres":
            with conn.cursor() as cur:
                cur.execute(SCHEMA_PG)
        else:
            with conn:
                conn.execute(SCHEMA)
                conn.commit()
    finally:
        conn.close()


def config_logging() -> None:
    handler = logging.FileHandler(LOG_PATH)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    )
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not any(
        isinstance(h, logging.FileHandler) and os.path.basename(h.baseFilename) == LOG_PATH.name
        for h in root.handlers
    ):
        root.addHandler(handler)


config_logging()


# --------------------------------------------------------------------------- #
# Banco
# --------------------------------------------------------------------------- #


# --------------------------------------------------------------------------- #
# Regras de horário
# --------------------------------------------------------------------------- #


def minutos(hora: str) -> int:
    h, m = hora.split(":")
    return int(h) * 60 + int(m)


def rotulo_hora(valor: int) -> str:
    return f"{valor // 60:02d}:{valor % 60:02d}"


def proximos_dias(quantidade: int = DAYS_AHEAD) -> list[dict]:
    hoje = dia_de_hoje()
    dias = []
    for offset in range(quantidade):
        dia = hoje + timedelta(days=offset)
        if offset == 0:
            rotulo = "Hoje"
        elif offset == 1:
            rotulo = "Amanhã"
        else:
            rotulo = DIAS_CURTOS[dia.weekday()]
        dias.append(
            {
                "iso": dia.isoformat(),
                "dia": dia.day,
                "mes": MESES_CURTOS[dia.month - 1],
                "semana": DIAS_CURTOS[dia.weekday()],
                "rotulo": rotulo,
                "fechado": dia.weekday() in CLOSED_WEEKDAYS,
            }
        )
    return dias


def intervalos_ocupados(dia: date) -> list[tuple[int, int]]:
    rows = get_db().execute(
        "SELECT hora, servico FROM agendamentos WHERE data = ? AND status != 'cancelado'",
        (dia.isoformat(),),
    ).fetchall()
    intervalos = []
    for row in rows:
        servico = SERVICO_POR_ID.get(row["servico"])
        inicio = minutos(row["hora"])
        intervalos.append((inicio, inicio + (servico["duracao"] if servico else 30)))
    return intervalos


def horarios_disponiveis(dia: date, duracao: int) -> list[dict]:
    if dia.weekday() in CLOSED_WEEKDAYS:
        return []
    ocupados = intervalos_ocupados(dia)
    horarios = []
    for inicio in range(OPEN_MINUTES, CLOSE_MINUTES - duracao + 1, SLOT_STEP):
        fim = inicio + duracao
        livre = all(fim <= a or inicio >= b for a, b in ocupados)
        horarios.append({"hora": rotulo_hora(inicio), "disponivel": livre})
    return horarios


def serializar(row) -> dict:
    servico = SERVICO_POR_ID.get(row["servico"])
    return {
        "id": row["id"],
        "nome": row["nome"],
        "whatsapp": row["whatsapp"],
        "servico_id": row["servico"],
        "servico": servico["nome"] if servico else row["servico"],
        "preco": servico["preco"] if servico else 0.0,
        "duracao": servico["duracao"] if servico else 30,
        "data": row["data"],
        "hora": row["hora"],
        "obs": row["obs"],
        "status": row["status"],
        "criado_em": row["criado_em"],
    }


def erro(mensagem: str, codigo: int = 400):
    return jsonify({"erro": mensagem}), codigo


@app.errorhandler(500)
def tratador_erros_500(erro_interno):
    app.logger.exception("Erro não tratado: %s", erro_interno)
    return jsonify({"erro": "Erro interno. Tente novamente mais tarde."}), 500


@app.get("/healthz")
def healthz():
    db = get_db()
    db.execute("SELECT 1").fetchone()
    return jsonify(
        {
            "status": "ok",
            "banco_de_dados": db.engine,
            "horario_agora": agora().isoformat(timespec="seconds"),
        }
    )


# --------------------------------------------------------------------------- #
# Páginas
# --------------------------------------------------------------------------- #


@app.template_filter("moeda")
def filtro_moeda(valor: float) -> str:
    texto = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if texto.endswith(",00"):
        texto = texto[:-3]
    return f"R$ {texto}"


@app.get("/")
def pagina_agendamento():
    return render_template(
        "index.html",
        studio=STUDIO,
        servicos=SERVICOS,
        dias=proximos_dias(),
    )


@app.get("/painel")
def pagina_painel():
    if not session.get("studio_ok"):
        return render_template("login.html", studio=STUDIO, erro=None), 401
    return render_template("painel.html", studio=STUDIO)


@app.post("/painel/entrar")
def entrar_painel():
    senha = str(request.form.get("senha", "")).strip()
    if secrets.compare_digest(senha, PANEL_SENHA):
        session.permanent = True
        session["studio_ok"] = True
        return redirect(url_for("pagina_painel"))
    return render_template("login.html", studio=STUDIO, erro="Senha incorreta. Tente novamente."), 401


@app.post("/painel/sair")
def sair_painel():
    session.clear()
    return redirect(url_for("pagina_painel"))


def requer_painel(funcao):
    @wraps(funcao)
    def protegida(*args, **kwargs):
        if not session.get("studio_ok"):
            return jsonify({"erro": "Acesso restrito ao painel."}), 401
        return funcao(*args, **kwargs)

    return protegida


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #


@app.get("/api/horarios")
def api_horarios():
    try:
        dia = date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return erro("Data inválida.")
    servico = SERVICO_POR_ID.get(request.args.get("servico", ""))
    duracao = servico["duracao"] if servico else 30
    return jsonify(
        {
            "data": dia.isoformat(),
            "fechado": dia.weekday() in CLOSED_WEEKDAYS,
            "horarios": horarios_disponiveis(dia, duracao),
        }
    )


@app.post("/api/agendamentos")
def api_criar_agendamento():
    payload = request.get_json(silent=True) or {}

    nome = str(payload.get("nome", "")).strip()
    whatsapp = "".join(ch for ch in str(payload.get("whatsapp", "")) if ch.isdigit())
    servico = SERVICO_POR_ID.get(str(payload.get("servico", "")))
    obs = str(payload.get("obs", "")).strip()[:280]

    if len(nome) < 2:
        return erro("Informe seu nome completo.")
    if len(whatsapp) not in (10, 11):
        return erro("Informe um WhatsApp válido com DDD.")
    if servico is None:
        return erro("Escolha um serviço.")

    try:
        dia = date.fromisoformat(str(payload.get("data", "")))
    except ValueError:
        return erro("Escolha um dia.")

    hoje = dia_de_hoje()
    if dia < hoje or dia > hoje + timedelta(days=DAYS_AHEAD - 1):
        return erro("Escolha um dia dentro do período disponível.")
    if dia.weekday() in CLOSED_WEEKDAYS:
        return erro("O studio não atende aos domingos.")

    hora = str(payload.get("hora", ""))
    horarios = horarios_disponiveis(dia, servico["duracao"])
    escolhido = next((item for item in horarios if item["hora"] == hora), None)
    if escolhido is None:
        return erro("Escolha um horário válido.")
    if not escolhido["disponivel"]:
        return erro("Esse horário acabou de ser preenchido. Escolha outro.")

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO agendamentos (nome, whatsapp, servico, data, hora, obs, status, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)
        """,
        (nome, whatsapp, servico["id"], dia.isoformat(), hora, obs, agora().isoformat(timespec="seconds")),
    )
    db.commit()
    row = db.execute("SELECT * FROM agendamentos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify({"mensagem": "Agendamento recebido.", "agendamento": serializar(row)}), 201


@app.get("/api/painel")
@requer_painel
def api_painel():
    limite = (dia_de_hoje() - timedelta(days=30)).isoformat()
    rows = get_db().execute(
        "SELECT * FROM agendamentos WHERE data >= ? ORDER BY data, hora LIMIT 200",
        (limite,),
    ).fetchall()
    agendamentos = [serializar(row) for row in rows]

    hoje = dia_de_hoje().isoformat()
    fim_semana = (dia_de_hoje() + timedelta(days=6)).isoformat()
    ativos = [item for item in agendamentos if item["status"] != "cancelado"]

    resumo = {
        "hoje": sum(1 for item in ativos if item["data"] == hoje),
        "semana": sum(1 for item in ativos if hoje <= item["data"] <= fim_semana),
        "aguardando": sum(1 for item in agendamentos if item["status"] == "pendente"),
        "previsto_hoje": round(sum(item["preco"] for item in ativos if item["data"] == hoje), 2),
        "atualizado_em": agora().strftime("%H:%M"),
    }
    return jsonify({"resumo": resumo, "agendamentos": agendamentos})


@app.patch("/api/agendamentos/<int:agendamento_id>")
@requer_painel
def api_atualizar_status(agendamento_id: int):
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", ""))
    if status not in STATUSES:
        return erro("Status inválido.")
    db = get_db()
    cursor = db.execute("UPDATE agendamentos SET status = ? WHERE id = ?", (status, agendamento_id))
    db.commit()
    if cursor.rowcount == 0:
        return erro("Agendamento não encontrado.", 404)
    return jsonify({"ok": True, "status": status})


@app.delete("/api/agendamentos/<int:agendamento_id>")
@requer_painel
def api_excluir_agendamento(agendamento_id: int):
    db = get_db()
    cursor = db.execute("DELETE FROM agendamentos WHERE id = ?", (agendamento_id,))
    db.commit()
    if cursor.rowcount == 0:
        return erro("Agendamento não encontrado.", 404)
    return jsonify({"ok": True})


init_db()


@app.get("/favicon.ico")
def favicon_ico():
    return app.send_static_file("img/favicon.svg")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")

    def _iniciar_ipv6():
        # Listener IPv6 do localhost (::1) — cobre o `localhost` nesta máquina.
        # Caso o IPv6 não esteja disponível, o servidor IPv4 (0.0.0.0) cobre a rede.
        try:
            app.run(host="::1", port=port, threaded=True)
        except Exception:
            pass

    threading.Thread(target=_iniciar_ipv6, daemon=True).start()
    app.run(
        host=host,
        port=port,
        debug=os.environ.get("FLASK_DEBUG") == "1",
        threaded=True,
    )
