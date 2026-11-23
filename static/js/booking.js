/* Davila Beauty — página de agendamento */

(() => {
  "use strict";

  const form = document.querySelector("#form-agendamento");
  const slots = document.querySelector("#slots");
  const resumo = document.querySelector("#summary");
  const botaoConfirmar = document.querySelector("#confirmar");
  const campoWhatsapp = document.querySelector("#whatsapp");
  const sucesso = document.querySelector("#sucesso");

  const estado = {
    servico: null,
    nomeServico: "",
    duracao: 30,
    data: null,
    dataLabel: "",
    hora: null,
  };

  let tokenHorarios = 0;
  let toastTimer = null;

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const SEMANAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function aviso(mensagem, erro = false) {
    const toast = document.querySelector("#toast");
    toast.textContent = mensagem;
    toast.classList.toggle("is-error", erro);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
  }

  function dataDe(iso) {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return new Date(ano, mes - 1, dia, 12);
  }

  function rotuloData(iso) {
    const data = dataDe(iso);
    return `${SEMANAS[data.getDay()]}, ${data.getDate()} ${MESES[data.getMonth()]}`;
  }

  function dinheiro(valor) {
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function mascaraTelefone(digitos) {
    if (!digitos) return "";
    if (digitos.length <= 2) return `(${digitos}`;
    const ddd = digitos.slice(0, 2);
    const resto = digitos.slice(2);
    if (resto.length <= 4) return `(${ddd}) ${resto}`;
    const corte = resto.length > 8 ? 5 : 4;
    return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte, corte + 4)}`;
  }

  function atualizarResumo() {
    const partes = [];
    if (estado.nomeServico) partes.push(estado.nomeServico);
    if (estado.dataLabel) partes.push(estado.dataLabel);
    if (estado.hora) partes.push(estado.hora);
    resumo.textContent = partes.length ? partes.join(" · ") : "Escolha serviço, dia e horário";
  }

  /* ------------------------------------------------------------------ */
  /* Serviços                                                            */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('input[name="servico"]').forEach((input) => {
    input.addEventListener("change", () => {
      estado.servico = input.value;
      estado.nomeServico = input.dataset.nome;
      estado.duracao = Number(input.dataset.duracao);
      if (estado.data) carregarHorarios();
      atualizarResumo();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Dias                                                                */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll(".day").forEach((botao) => {
    botao.addEventListener("click", () => {
      if (botao.disabled) return;

      document.querySelectorAll(".day").forEach((outro) => outro.classList.remove("is-active"));
      botao.classList.add("is-active");

      estado.data = botao.dataset.data;
      estado.dataLabel = botao.dataset.label;
      estado.hora = null;
      atualizarResumo();
      carregarHorarios();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Horários                                                            */
  /* ------------------------------------------------------------------ */

  async function carregarHorarios() {
    if (!estado.data) return;

    const token = ++tokenHorarios;
    slots.innerHTML = '<p class="hint">Buscando horários livres…</p>';

    try {
      const params = new URLSearchParams({ data: estado.data });
      if (estado.servico) params.set("servico", estado.servico);

      const resposta = await fetch(`/api/horarios?${params.toString()}`);
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar os horários.");
      if (token !== tokenHorarios) return;

      if (dados.fechado || !dados.horarios.length) {
        slots.innerHTML = `<p class="hint">${
          dados.fechado ? "O studio não abre nesse dia." : "Nenhum horário livre nesse dia."
        }</p>`;
        return;
      }

      slots.innerHTML = "";
      dados.horarios.forEach((horario) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "slot";
        botao.textContent = horario.hora;
        botao.disabled = !horario.disponivel;
        if (!horario.disponivel) botao.title = "Horário já ocupado";
        if (horario.hora === estado.hora && horario.disponivel) botao.classList.add("is-active");

        botao.addEventListener("click", () => {
          if (botao.disabled) return;
          slots.querySelectorAll(".slot").forEach((outro) => outro.classList.remove("is-active"));
          botao.classList.add("is-active");
          estado.hora = horario.hora;
          atualizarResumo();
        });

        slots.appendChild(botao);
      });

      if (estado.hora && !slots.querySelector(".slot.is-active")) {
        estado.hora = null;
        atualizarResumo();
      }
    } catch (erro) {
      if (token !== tokenHorarios) return;
      slots.innerHTML = '<p class="hint">Não foi possível carregar os horários. Tente outro dia.</p>';
      aviso(erro.message, true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* WhatsApp                                                            */
  /* ------------------------------------------------------------------ */

  campoWhatsapp.addEventListener("input", () => {
    const digitos = campoWhatsapp.value.replace(/\D/g, "").slice(0, 11);
    campoWhatsapp.value = mascaraTelefone(digitos);
  });

  /* ------------------------------------------------------------------ */
  /* Envio                                                               */
  /* ------------------------------------------------------------------ */

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = document.querySelector("#nome").value.trim();
    const digitos = campoWhatsapp.value.replace(/\D/g, "");

    if (!estado.servico) return aviso("Escolha o serviço.");
    if (!estado.data) return aviso("Escolha o dia.");
    if (!estado.hora) return aviso("Escolha o horário.");
    if (nome.length < 2) return aviso("Informe seu nome completo.");
    if (digitos.length < 10) return aviso("Informe um WhatsApp com DDD.");

    botaoConfirmar.disabled = true;
    botaoConfirmar.textContent = "Enviando…";

    try {
      const resposta = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          whatsapp: digitos,
          servico: estado.servico,
          data: estado.data,
          hora: estado.hora,
          obs: document.querySelector("#obs").value.trim(),
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || "Não foi possível agendar.");

      mostrarSucesso(dados.agendamento);
    } catch (erro) {
      aviso(erro.message, true);
      carregarHorarios();
    } finally {
      botaoConfirmar.disabled = false;
      botaoConfirmar.textContent = "Confirmar agendamento";
    }
  });

  function mostrarSucesso(agendamento) {
    document.querySelector("#sucesso-servico").textContent =
      `${agendamento.servico} · ${agendamento.duracao} min`;
    document.querySelector("#sucesso-quando").textContent =
      `${rotuloData(agendamento.data)} às ${agendamento.hora}`;
    document.querySelector("#sucesso-preco").textContent = dinheiro(agendamento.preco);
    document.querySelector("#sucesso-nome").textContent = agendamento.nome;

    form.hidden = true;
    sucesso.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelector("#novo-agendamento").addEventListener("click", () => {
    form.reset();
    estado.servico = null;
    estado.nomeServico = "";
    estado.duracao = 30;
    estado.data = null;
    estado.dataLabel = "";
    estado.hora = null;

    document.querySelectorAll(".day").forEach((botao) => botao.classList.remove("is-active"));
    slots.innerHTML = '<p class="hint">Selecione um dia para ver os horários livres.</p>';
    atualizarResumo();

    sucesso.hidden = true;
    form.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  atualizarResumo();
})();
