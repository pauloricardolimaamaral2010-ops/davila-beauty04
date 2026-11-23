/* Davila Beauty — painel da dona */

(() => {
  "use strict";

  const lista = document.querySelector("#lista");
  const vazio = document.querySelector("#vazio");
  const busca = document.querySelector("#busca");
  const labelHoje = document.querySelector("#hoje-label");

  const ICONES = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    lixo: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 15L2 22l5.14-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15l-.3-.18-3.05.89.9-2.98-.2-.31a8.1 8.1 0 0 1 6.85-12.42Zm-3.3 4.2c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.42 1.02 2.59.13.16 1.75 2.8 4.33 3.8 2.14.85 2.58.68 3.04.64.46-.04 1.5-.61 1.71-1.2.21-.6.21-1.1.15-1.2-.06-.1-.23-.16-.48-.28-.25-.12-1.5-.74-1.73-.83-.23-.08-.4-.12-.57.13-.17.25-.65.83-.8 1-.14.16-.29.18-.54.06-.25-.13-1.06-.4-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.01-.39.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.86-.2-.49-.41-.42-.57-.43h-.5Z"/></svg>',
  };

  const STATUS = {
    pendente: "Aguardando",
    confirmado: "Confirmado",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const estado = {
    dados: null,
    filtro: "semana",
    termo: "",
  };

  let toastTimer = null;

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function esc(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizar(texto) {
    return String(texto ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function aviso(mensagem, erro = false) {
    const toast = document.querySelector("#toast");
    toast.textContent = mensagem;
    toast.classList.toggle("is-error", erro);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
  }

  function paraISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  function dataDe(iso) {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return new Date(ano, mes - 1, dia, 12);
  }

  function somarDias(iso, dias) {
    const data = dataDe(iso);
    data.setDate(data.getDate() + dias);
    return paraISO(data);
  }

  function dinheiro(valor) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function telefone(digitos) {
    const numero = String(digitos);
    if (numero.length === 11) return `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}`;
    if (numero.length === 10) return `(${numero.slice(0, 2)}) ${numero.slice(2, 6)}-${numero.slice(6)}`;
    return numero;
  }

  function rotuloData(iso) {
    return dataDe(iso).toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).replace(/\./g, "");
  }

  function rotuloGrupo(iso, hoje, amanha) {
    if (iso === hoje) return "Hoje";
    if (iso === amanha) return "Amanhã";
    const texto = dataDe(iso).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function linkWhatsApp(item) {
    const numero = String(item.whatsapp).replace(/\D/g, "");
    const primeiro = String(item.nome).trim().split(" ")[0];
    const mensagem =
      `Olá, ${primeiro}! Aqui é da Davila Beauty. ` +
      `Confirmando seu horário: ${item.servico} em ${rotuloData(item.data)} às ${item.hora}. Até lá!`;
    return `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`;
  }

  async function api(url, opcoes = {}) {
    const resposta = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opcoes,
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a ação.");
    return dados;
  }

  /* ------------------------------------------------------------------ */
  /* Carga e resumo                                                      */
  /* ------------------------------------------------------------------ */

  async function carregar() {
    lista.setAttribute("aria-busy", "true");
    try {
      const dados = await api("/api/painel");
      estado.dados = dados;
      renderizarResumo(dados.resumo);
      renderizarLista();
      document.querySelector("#atualizado").textContent = dados.resumo.atualizado_em;
    } catch (erro) {
      if (erro.message.includes("restrito")) {
        window.location.href = "/painel";
        return;
      }
      aviso(erro.message, true);
    } finally {
      lista.removeAttribute("aria-busy");
    }
  }

  function renderizarResumo(resumo) {
    document.querySelector("#stat-hoje").textContent = resumo.hoje;
    document.querySelector("#stat-semana").textContent = resumo.semana;
    document.querySelector("#stat-aguardando").textContent = resumo.aguardando;
    document.querySelector("#stat-previsto").textContent = dinheiro(resumo.previsto_hoje);

    const hoje = new Date();
    const texto = hoje.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    const atendimentos = resumo.hoje === 1 ? "1 atendimento hoje" : `${resumo.hoje} atendimentos hoje`;
    labelHoje.textContent = `${texto} · ${atendimentos}`;
  }

  /* ------------------------------------------------------------------ */
  /* Lista                                                               */
  /* ------------------------------------------------------------------ */

  function filtrar() {
    if (!estado.dados) return [];

    const hoje = paraISO(new Date());
    const amanha = somarDias(hoje, 1);
    const fimSemana = somarDias(hoje, 6);
    const termo = normalizar(estado.termo).trim();

    return estado.dados.agendamentos
      .filter((item) => {
        if (estado.filtro === "hoje" && item.data !== hoje) return false;
        if (estado.filtro === "amanha" && item.data !== amanha) return false;
        if (estado.filtro === "semana" && (item.data < hoje || item.data > fimSemana)) return false;
        if (!termo) return true;
        const alvo = normalizar(
          `${item.nome} ${item.servico} ${item.whatsapp} ${item.hora} ${telefone(item.whatsapp)}`
        );
        return alvo.includes(termo);
      })
      .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  }

  function renderizarLista() {
    const itens = filtrar();
    const hoje = paraISO(new Date());
    const amanha = somarDias(hoje, 1);

    vazio.hidden = itens.length > 0;
    lista.hidden = itens.length === 0;

    if (!itens.length) {
      lista.innerHTML = "";
      return;
    }

    const grupos = new Map();
    itens.forEach((item) => {
      if (!grupos.has(item.data)) grupos.set(item.data, []);
      grupos.get(item.data).push(item);
    });

    let html = "";
    grupos.forEach((agendamentos, dia) => {
      const total = agendamentos.length === 1 ? "1 agendamento" : `${agendamentos.length} agendamentos`;
      html += `
        <div class="group-head">
          <span class="group-title">${esc(rotuloGrupo(dia, hoje, amanha))}</span>
          <span class="group-line"></span>
          <span class="group-count">${total}</span>
        </div>
      `;
      agendamentos.forEach((item) => {
        html += cartao(item);
      });
    });

    lista.innerHTML = html;
  }

  function cartao(item) {
    const acoes = [];

    if (item.status === "pendente") {
      acoes.push(botao(item, "confirmado", "Confirmar", ICONES.check, "icon-ok"));
    }
    if (item.status === "confirmado") {
      acoes.push(botao(item, "concluido", "Concluir", ICONES.check, "icon-ok"));
    }
    if (item.status !== "cancelado" && item.status !== "concluido") {
      acoes.push(botao(item, "cancelado", "Cancelar", ICONES.x, "icon-danger"));
    }

    acoes.push(
      `<a class="icon-btn icon-whats" href="${linkWhatsApp(item)}" target="_blank" rel="noopener"` +
        ` title="Chamar no WhatsApp" aria-label="Chamar ${esc(item.nome)} no WhatsApp">${ICONES.whatsapp}</a>`
    );

    acoes.push(
      `<button type="button" class="icon-btn icon-danger" data-acao="excluir" data-id="${item.id}"` +
        ` title="Excluir" aria-label="Excluir agendamento de ${esc(item.nome)}">${ICONES.lixo}</button>`
    );

    return `
      <article class="appt" data-status="${esc(item.status)}">
        <div class="appt-time">
          <span class="appt-hour">${esc(item.hora)}</span>
          <span class="appt-dur">${item.duracao} min</span>
        </div>
        <div class="appt-main">
          <div class="appt-top">
            <h4 class="appt-name">${esc(item.nome)}</h4>
            <span class="pill pill-${esc(item.status)}">${STATUS[item.status] || esc(item.status)}</span>
          </div>
          <p class="appt-service">${esc(item.servico)} · ${dinheiro(item.preco)}</p>
          <a class="appt-phone" href="${linkWhatsApp(item)}" target="_blank" rel="noopener">${telefone(item.whatsapp)}</a>
          ${item.obs ? `<p class="appt-obs">“${esc(item.obs)}”</p>` : ""}
        </div>
        <div class="appt-actions">${acoes.join("")}</div>
      </article>
    `;
  }

  function botao(item, status, titulo, icone, classe) {
    return (
      `<button type="button" class="icon-btn ${classe}" data-acao="${status}" data-id="${item.id}"` +
      ` title="${titulo}" aria-label="${titulo} agendamento de ${esc(item.nome)}">${icone}</button>`
    );
  }

  /* ------------------------------------------------------------------ */
  /* Ações                                                               */
  /* ------------------------------------------------------------------ */

  const MENSAGENS = {
    confirmado: "Agendamento confirmado.",
    concluido: "Atendimento concluído.",
    cancelado: "Agendamento cancelado.",
  };

  lista.addEventListener("click", async (evento) => {
    const botaoClicado = evento.target.closest("[data-acao]");
    if (!botaoClicado) return;

    const id = botaoClicado.dataset.id;
    const acao = botaoClicado.dataset.acao;
    const item = estado.dados?.agendamentos.find((agendamento) => String(agendamento.id) === id);

    if (acao === "excluir") {
      if (!confirm(`Excluir o agendamento de ${item ? item.nome : "cliente"}?`)) return;
      botaoClicado.disabled = true;
      try {
        await api(`/api/agendamentos/${id}`, { method: "DELETE" });
        aviso("Agendamento excluído.");
        await carregar();
      } catch (erro) {
        aviso(erro.message, true);
        botaoClicado.disabled = false;
      }
      return;
    }

    botaoClicado.disabled = true;
    try {
      await api(`/api/agendamentos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: acao }),
      });
      aviso(MENSAGENS[acao] || "Agenda atualizada.");
      await carregar();
    } catch (erro) {
      aviso(erro.message, true);
      botaoClicado.disabled = false;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Controles                                                           */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll(".tab").forEach((aba) => {
    aba.addEventListener("click", () => {
      estado.filtro = aba.dataset.filtro;
      marcarAbaAtiva();
      renderizarLista();
    });
  });

  function marcarAbaAtiva() {
    document.querySelectorAll(".tab").forEach((aba) => {
      const ativa = aba.dataset.filtro === estado.filtro;
      aba.classList.toggle("is-active", ativa);
      aba.setAttribute("aria-selected", ativa ? "true" : "false");
    });
  }

  const filtroUrl = new URLSearchParams(window.location.search).get("filtro");
  if (["hoje", "amanha", "semana", "todas"].includes(filtroUrl)) {
    estado.filtro = filtroUrl;
  }
  marcarAbaAtiva();

  busca.addEventListener("input", () => {
    estado.termo = busca.value;
    renderizarLista();
  });

  document.querySelector("#atualizar").addEventListener("click", carregar);

  setInterval(() => {
    if (!document.hidden) carregar();
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) carregar();
  });

  carregar();
})();
