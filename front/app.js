// Pátio Monitor · front do MVP.
// Operação (a cada 3 s): /posicoes e /alertas. Mapa (a cada 30 s): /onibus-mapa. Camada Ouro (1x): /permanencia.
const API = new URLSearchParams(location.search).get("api") || "/api";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const hora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "–");

async function api(caminho, opts) {
  const r = await fetch(API + caminho, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(r.status + " em " + caminho);
  return r.json();
}

// Status de conciliação: classe de cor + ícone + rótulo (a cor nunca carrega o significado sozinha).
const STATUS = {
  ok: { classe: "ok", icone: "✓", rotulo: "No horário" },
  atrasada: { classe: "atencao", icone: "!", rotulo: "Atrasada" },
  parado_vaga_errada: { classe: "serio", icone: "▲", rotulo: "Vaga errada" },
  veiculo_trocado: { classe: "serio", icone: "⇄", rotulo: "Veículo trocado" },
  saida_sem_confirmacao: { classe: "critico", icone: "✕", rotulo: "Saída sem confirmação" },
};
const st = (s) => STATUS[s || "ok"] || { classe: "serio", icone: "?", rotulo: s };
const selo = (s) => { const x = st(s); return `<span class="status st-${x.classe}"><i aria-hidden="true">${x.icone}</i>${esc(x.rotulo)}</span>`; };

/* ---------------- Operação: veículos, pendências e pátio 2D ---------------- */
let layout = null;

async function atualizar() {
  try {
    const [posicoes, alertas] = await Promise.all([api("/posicoes"), api("/alertas")]);
    const noPatio = posicoes.filter((p) => !["FORA"].includes(p.local));
    $("k-patio").textContent = noPatio.length;
    $("k-patio-nota").textContent = `${posicoes.length - noPatio.length} em viagem`;
    $("k-pend").textContent = alertas.length;
    const criticas = alertas.filter((a) => a.status === "saida_sem_confirmacao").length;
    $("k-pend-nota").textContent = criticas ? `${criticas} sem confirmação de saída` : "escala × portaria × GPS";
    $("pend-total").textContent = alertas.length ? `${alertas.length} abertas` : "tudo em ordem";

    $("alertas").innerHTML = alertas.length
      ? alertas.map((a) => `<li class="item ${st(a.status).classe}">
          <div class="linha1"><strong>Ônibus ${esc(a.prefixo_previsto || a.prefixo_registrado)}</strong>${selo(a.status)}</div>
          <div class="detalhe">Linha ${esc(a.linha || "–")} · ${esc(a.detalhe || "")}</div></li>`).join("")
      : `<li class="meta">Nenhuma pendência. Todas as viagens batem com a escala.</li>`;

    $("veiculos").innerHTML = posicoes.map((p) => `<tr class="${p.status_conciliacao ? "alerta" : ""}">
      <td><strong>${esc(p.prefixo)}</strong></td><td>${esc(p.linha)}</td><td>${esc(p.local)}</td><td>${esc(p.estado)}</td>
      <td class="num">${p.minutos_no_patio != null ? p.minutos_no_patio + " min" : "–"}</td><td>${selo(p.status_conciliacao)}</td>
      <td>${p.status_conciliacao ? `<button class="porque" data-prefixo="${esc(p.prefixo)}" data-status="${esc(p.status_conciliacao)}">Por quê?</button>` : ""}</td></tr>`).join("");

    desenharPatio(posicoes);
    $("ponto").className = "ponto ok";
    $("conexao").textContent = "ao vivo · " + new Date().toLocaleTimeString("pt-BR");
  } catch (e) {
    $("ponto").className = "ponto erro";
    $("conexao").textContent = "sem conexão com a API";
  }
}

function desenharPatio(posicoes) {
  if (!layout) return;
  const porLocal = {};
  posicoes.forEach((p) => { (porLocal[p.local] ||= []).push(p); });
  const ls = layout.locais;
  const minX = Math.min(...ls.map((l) => l.x - l.w / 2)) - 3, maxX = Math.max(...ls.map((l) => l.x + l.w / 2)) + 3;
  const minZ = Math.min(...ls.map((l) => l.z - l.d / 2)) - 6, maxZ = Math.max(...ls.map((l) => l.z + l.d / 2)) + 6;
  const svg = $("patio");
  svg.setAttribute("viewBox", `${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`);
  const vagas = ls.filter((l) => l.tipo === "vaga"), plats = ls.filter((l) => l.tipo === "plataforma");
  const meio = (xs) => (Math.min(...xs.map((l) => l.x)) + Math.max(...xs.map((l) => l.x))) / 2;
  let h = `<rect class="chao" x="${minX + 1}" y="${minZ + 1}" width="${maxX - minX - 2}" height="${maxZ - minZ - 2}" rx="1.5"/>`;
  h += `<text class="rot" x="${meio(vagas)}" y="${Math.min(...vagas.map((l) => l.z - l.d / 2)) - 2}">VAGAS DE ESTACIONAMENTO</text>`;
  h += `<text class="rot" x="${meio(plats)}" y="${Math.max(...plats.map((l) => l.z + l.d / 2)) + 2.2}">PLATAFORMAS DE EMBARQUE</text>`;
  for (const l of ls) {
    const ocup = porLocal[l.codigo] || [];
    const alerta = ocup.find((p) => p.status_conciliacao);
    const cls = ["vaga", ocup.length ? "ocupada" : "", alerta ? "alerta" : "", alerta && st(alerta.status_conciliacao).classe === "critico" ? "critico" : ""].join(" ");
    const titulo = ocup.length ? `${l.nome}: ${ocup.map((p) => `${p.prefixo} (${p.linha}${p.status_conciliacao ? " · " + st(p.status_conciliacao).rotulo : ""})`).join(", ")}` : `${l.nome}: livre`;
    h += `<g><title>${esc(titulo)}</title><rect class="${cls}" x="${l.x - l.w / 2}" y="${l.z - l.d / 2}" width="${l.w}" height="${l.d}" rx=".6"/>`;
    h += `<text class="cod" x="${l.x}" y="${l.z - l.d / 2 + 1.4}">${esc(l.codigo === "PORTAO" ? "PORTÃO" : l.codigo)}</text>`;
    if (ocup.length) h += `<text class="pref" x="${l.x}" y="${l.z + (l.d > 5 ? .2 : .5)}">${esc(ocup[0].prefixo)}</text>`;
    if (alerta && l.d > 5) h += `<text class="ico ${st(alerta.status_conciliacao).classe}" x="${l.x}" y="${l.z + 2.2}">${st(alerta.status_conciliacao).icone}</text>`;
    h += `</g>`;
  }
  svg.innerHTML = h;
  const fora = (porLocal.FORA || []).length, circ = (porLocal.CIRCULACAO || []).length;
  $("patio-fora").textContent = `${circ} manobrando na faixa de circulação · ${fora} em viagem fora do pátio · passe o mouse numa vaga para ver o ônibus`;
}

$("veiculos").addEventListener("click", async (e) => {
  const b = e.target.closest("button.porque");
  if (!b) return;
  const pergunta = `Por que o ônibus ${b.dataset.prefixo} está com ${st(b.dataset.status).rotulo.toLowerCase()}? O que faço?`;
  $("resposta").hidden = false;
  $("pergunta").textContent = pergunta;
  $("texto-resposta").textContent = "Consultando…";
  try {
    const r = await api("/assistente", { method: "POST", body: JSON.stringify({ pergunta, prefixo: b.dataset.prefixo }) });
    $("texto-resposta").innerHTML = `<p><b>${esc(r.acao)}</b></p><p>${esc(r.justificativa)}</p>
      <p class="meta">Fonte: ${esc(r.fonte || "–")} · confiança ${Math.round((r.confianca || 0) * 100)}% · ${esc(r.modo || "")}</p>`;
  } catch (err) {
    $("texto-resposta").textContent = "Assistente indisponível (" + err.message + ").";
  }
});
$("fechar").addEventListener("click", () => { $("resposta").hidden = true; });

/* ---------------- Mapa: ônibus em volta do terminal (SPTrans Olho Vivo) ---------------- */
let mapa, camada;

function iniciarMapa(centro) {
  mapa = L.map("mapa", { scrollWheelZoom: false }).setView([centro.lat, centro.lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© colaboradores do OpenStreetMap",
  }).addTo(mapa);
  L.circle([centro.lat, centro.lon], { radius: 1500, color: css("--tinta-3"), weight: 1, dashArray: "4 6", fill: false }).addTo(mapa);
  L.circle([centro.lat, centro.lon], { radius: centro.raio_m, color: css("--marca"), weight: 2, fillOpacity: .12 }).addTo(mapa)
    .bindTooltip("Pátio do Terminal Pirituba (250 m)", { direction: "top" });
  camada = L.layerGroup().addTo(mapa);
}

async function atualizarMapa() {
  try {
    const r = await api("/onibus-mapa");
    if (!mapa) iniciarMapa(r.centro);
    camada.clearLayers();
    for (const o of r.onibus) {
      const cor = o.no_patio ? css("--marca") : css("--serie");
      L.circleMarker([o.lat, o.lon], { radius: o.no_patio ? 8 : 6, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 1 })
        .bindPopup(`<strong>Ônibus ${esc(o.prefixo)}</strong><br>Linha ${esc(o.linha || "–")}<br>${o.no_patio ? "No pátio" : "A " + fmt.format(o.distancia_m) + " m do pátio"}<br><span style="color:#777">posição de ${hora(o.data_hora)}</span>`)
        .bindTooltip(`${o.prefixo} · ${o.linha || ""}`)
        .addTo(camada);
    }
    const ao_vivo = r.fonte === "ao_vivo";
    $("mapa-fonte").textContent = ao_vivo ? "ao vivo · SPTrans" : r.fonte === "ultima_coleta" ? "última coleta do pipeline" : "sem dados";
    $("mapa-info").textContent = r.total
      ? `${r.total} ônibus num raio de 1,5 km · ${r.no_patio} dentro do pátio · posições de ${hora(r.atualizado)}`
      : "Sem posições disponíveis no momento.";
    $("k-mapa").textContent = r.total;
    $("k-mapa-nota").textContent = `${r.no_patio} no raio do pátio · ${ao_vivo ? "ao vivo" : "última coleta"}`;
  } catch (e) {
    $("mapa-info").textContent = "Mapa indisponível (" + e.message + ").";
  }
}

/* ---------------- Camada Ouro: indicadores e gráficos ---------------- */
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

function baseGrafico(extra = {}) {
  const tinta = css("--tinta-2"), grade = css("--linha");
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
    plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 6, displayColors: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tinta }, border: { color: grade } },
      y: { grid: { color: grade }, ticks: { color: tinta }, border: { display: false }, beginAtZero: true },
    },
    ...extra,
  };
}

function graficos(linhas) {
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const serie = css("--serie");
  const barra = { borderRadius: 4, borderSkipped: "start", maxBarThickness: 34 };

  // 1. Divergências por tipo (barra horizontal, cor = status, com rótulo no eixo)
  const tipos = ["atrasada", "veiculo_trocado", "saida_sem_confirmacao", "parado_vaga_errada"];
  const corStatus = { atencao: css("--atencao"), serio: css("--serio"), critico: css("--critico") };
  const cont = tipos.map((t) => linhas.filter((l) => l.status_conciliacao === t).length);
  new Chart($("g-status"), {
    type: "bar",
    data: { labels: tipos.map((t) => `${st(t).icone} ${st(t).rotulo}`), datasets: [{ label: "Viagens", data: cont, backgroundColor: tipos.map((t) => corStatus[st(t).classe]), ...barra }] },
    options: baseGrafico({ indexAxis: "y", scales: { x: { grid: { color: css("--linha") }, ticks: { color: css("--tinta-2"), precision: 0 }, beginAtZero: true, border: { display: false } }, y: { grid: { display: false }, ticks: { color: css("--tinta") } } } }),
  });

  // 2. % no horário por dia (indicador de impacto)
  const dias = [...new Set(linhas.map((l) => (l.saida_prevista || "").slice(0, 10)).filter(Boolean))].sort();
  const pct = dias.map((d) => { const ds = linhas.filter((l) => (l.saida_prevista || "").startsWith(d)); return +(100 * ds.filter((l) => l.status_conciliacao === "ok").length / ds.length).toFixed(1); });
  const nDia = dias.map((d) => linhas.filter((l) => (l.saida_prevista || "").startsWith(d)).length);
  new Chart($("g-dia"), {
    type: "bar",
    data: { labels: dias.map((d) => d.split("-").reverse().slice(0, 2).join("/")), datasets: [{ label: "% no horário", data: pct, backgroundColor: serie, ...barra }] },
    options: baseGrafico({
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${fmt.format(c.parsed.y)}% no horário · ${nDia[c.dataIndex]} viagens` } } },
      scales: { x: { grid: { display: false }, ticks: { color: css("--tinta-2") } }, y: { max: 100, grid: { color: css("--linha") }, ticks: { color: css("--tinta-2"), callback: (v) => v + "%" }, border: { display: false } } },
    }),
  });

  // 3. Permanência mediana por linha (só estadias com saída registrada)
  const fechadas = linhas.filter((l) => l.saida && l.entrada && l.minutos_parado !== "");
  const porLinha = {};
  fechadas.forEach((l) => (porLinha[l.linha] ||= []).push(+l.minutos_parado));
  const top = Object.entries(porLinha).sort((a, b) => b[1].length - a[1].length).slice(0, 8)
    .map(([linha, xs]) => ({ linha, med: mediana(xs), n: xs.length })).sort((a, b) => b.med - a.med);
  new Chart($("g-linha"), {
    type: "bar",
    data: { labels: top.map((t) => t.linha), datasets: [{ label: "Mediana (min)", data: top.map((t) => +t.med.toFixed(1)), backgroundColor: serie, ...barra }] },
    options: baseGrafico({
      indexAxis: "y",
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${fmt.format(c.parsed.x)} min · ${top[c.dataIndex].n} estadias` } } },
      scales: { x: { grid: { color: css("--linha") }, ticks: { color: css("--tinta-2"), callback: (v) => v + " min" }, beginAtZero: true, border: { display: false } }, y: { grid: { display: false }, ticks: { color: css("--tinta") } } },
    }),
  });

  // 4. Entradas por hora do dia (horário de Brasília)
  const porHora = Array(24).fill(0);
  linhas.forEach((l) => { if (l.entrada) porHora[+new Date(l.entrada).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }) % 24]++; });
  new Chart($("g-hora"), {
    type: "bar",
    data: { labels: porHora.map((_, h) => h + "h"), datasets: [{ label: "Entradas", data: porHora, backgroundColor: serie, ...barra, maxBarThickness: 18 }] },
    options: baseGrafico({ plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.parsed.y} entradas às ${c.label}` } } } }),
  });

  // Indicadores da Ouro
  const ok = linhas.filter((l) => l.status_conciliacao === "ok").length;
  $("k-hor").textContent = fmt.format(100 * ok / linhas.length) + "%";
  $("k-hor-nota").textContent = `${ok} de ${linhas.length} viagens · camada Ouro`;
  const med = mediana(fechadas.map((l) => +l.minutos_parado));
  $("k-perm").textContent = med != null ? fmt.format(med) + " min" : "–";
  $("ouro-resumo").innerHTML = `${linhas.length} viagens da camada Ouro (<code>fato_permanencia</code>), de ${dias.map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(", ")}. Pipeline: SPTrans Olho Vivo → Airflow → Databricks (Bronze → Prata → Ouro).`;
}

async function carregarOuro() {
  try {
    const r = await api("/permanencia?limite=5000");
    const linhas = r.linhas || [];
    if (!linhas.length) {
      $("ouro-info").textContent = "Aguardando o export da camada Ouro (data/ouro/fato_permanencia.csv).";
      return;
    }
    const recentes = [...linhas].sort((a, b) => (b.saida_prevista || "").localeCompare(a.saida_prevista || "")).slice(0, 25);
    $("ouro-info").textContent = `${recentes.length} viagens mais recentes de ${linhas.length} · fonte: ${r.fonte}`;
    $("ouro").innerHTML = recentes.map((l) => `<tr class="${l.status_conciliacao !== "ok" ? "alerta" : ""}">
      <td>${esc(l.viagem_id)}</td><td class="linha-tag">${esc(l.linha)}</td><td>${esc(l.prefixo_veiculo || l.prefixo_previsto)}</td>
      <td>${hora(l.entrada)}</td><td>${hora(l.saida)}</td><td class="num">${l.minutos_parado !== "" ? fmt.format(+l.minutos_parado) : "–"}</td>
      <td>${selo(l.status_conciliacao)}</td></tr>`).join("");
    graficos(linhas);
  } catch (e) {
    $("ouro-info").textContent = "Camada Ouro indisponível (" + e.message + ").";
  }
}

(async () => {
  try { layout = await api("/layout"); } catch { layout = null; }
  atualizar();
  atualizarMapa();
  carregarOuro();
  setInterval(atualizar, 3000);
  setInterval(atualizarMapa, 30000);
})();
