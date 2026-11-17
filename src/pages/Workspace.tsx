import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  Filter,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import "./Workspace.css";

type Section = "Hoje" | "Processos" | "Agenda" | "Financeiro" | "Pesquisa";
type QuickAction = "Tarefa" | "Processo" | "Lançamento";

const navigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Hoje", icon: LayoutDashboard },
  { label: "Processos", icon: BriefcaseBusiness },
  { label: "Agenda", icon: CalendarDays },
  { label: "Financeiro", icon: Wallet },
  { label: "Pesquisa", icon: BookOpenText },
];

const initialTasks = [
  { id: 1, title: "Separar documentos para a reunião", matter: "Família · cliente de exemplo", time: "10:30", done: false },
  { id: 2, title: "Retornar mensagem sobre o contrato", matter: "Cível · cliente de exemplo", time: "14:00", done: false },
  { id: 3, title: "Revisar minuta de acordo", matter: "Trabalhista · cliente de exemplo", time: "Concluída", done: true },
];

const initialEntries = [
  { id: 1, title: "Honorários · parcela 2 de 3", detail: "Cliente de exemplo · vence hoje", value: 85000, kind: "receita", state: "A receber" },
  { id: 2, title: "Honorários · consulta inicial", detail: "Cliente de exemplo · recebido ontem", value: 35000, kind: "receita", state: "Recebido" },
  { id: 3, title: "Certidões e cópias", detail: "Despesa de exemplo · 12 nov", value: 4800, kind: "despesa", state: "Pago" },
];

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);

const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

const Workspace = () => {
  const [section, setSection] = useState<Section>("Hoje");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [entries, setEntries] = useState(initialEntries);
  const [dialog, setDialog] = useState<"quick" | "notice" | QuickAction | null>(null);
  const [noticeReviewed, setNoticeReviewed] = useState(false);
  const [toast, setToast] = useState("");
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFirstControl = window.requestAnimationFrame(() => {
      const currentFocus = document.activeElement;
      const alreadyInside = currentFocus && modalRef.current?.contains(currentFocus);
      if (!alreadyInside) modalRef.current?.querySelector<HTMLElement>("[autofocus], button, input, select, textarea, a[href]")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialog(null);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const controls = Array.from(modalRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [dialog]);

  const filteredMatters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const matters = [
      { name: "Cliente de exemplo · Direito de família", type: "Divórcio consensual", court: "TJPR · exemplo", status: "Organizado" },
      { name: "Cliente de exemplo · Direito cível", type: "Cobrança contratual", court: "TJSC · exemplo", status: "Acompanhar" },
      { name: "Cliente de exemplo · Direito do trabalho", type: "Verbas rescisórias", court: "TRT · exemplo", status: "Em andamento" },
    ];
    if (!query) return matters;
    return matters.filter((matter) => `${matter.name} ${matter.type} ${matter.court}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [search]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const createItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    if (dialog === "Tarefa") {
      setTasks((current) => [{ id: Date.now(), title, matter: "Novo item de exemplo", time: "A combinar", done: false }, ...current]);
      notify("Tarefa adicionada ao exemplo.");
    } else if (dialog === "Lançamento") {
      const amount = Math.round(Number(String(form.get("amount")).replace(",", ".")) * 100);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const kind = String(form.get("kind")) === "despesa" ? "despesa" : "receita";
      setEntries((current) => [{ id: Date.now(), title, detail: "Lançamento de exemplo · agora", value: amount, kind, state: kind === "receita" ? "A receber" : "A pagar" }, ...current]);
      notify("Lançamento adicionado ao exemplo.");
    } else {
      notify("Cadastro demonstrativo pronto para o próximo passo.");
    }
    setDialog(null);
  };

  const toggleTask = (id: number) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done, time: task.done ? task.time : "Concluída" } : task));
  };

  const openQuick = () => setDialog("quick");

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="Navegação principal">
        <a className="workspace-brand" href="/" aria-label="Voltar ao site da Márcia">
          <span className="brand-monogram">M</span>
          <span><strong>Márcia</strong><small>ESCRITÓRIO JURÍDICO</small></span>
        </a>

        <div className="workspace-demo"><span className="demo-dot" /> Demonstração com dados fictícios</div>
        <p className="workspace-nav-label">SEU ESCRITÓRIO</p>
        <nav className="workspace-nav">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`workspace-nav-item ${section === label ? "is-active" : ""}`} onClick={() => { setSection(label); setSearch(""); }} aria-current={section === label ? "page" : undefined}>
              <Icon size={19} strokeWidth={1.8} /> <span>{label}</span>
              {label === "Hoje" && !noticeReviewed && <i className="nav-count">1</i>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <button className="workspace-nav-item muted-nav" onClick={() => notify("Configurações entrarão na próxima etapa do produto.")}><Settings2 size={19} /> <span>Configurações</span></button>
        <button className="workspace-nav-item muted-nav" onClick={() => notify("Ajuda e suporte serão adicionados na próxima etapa.")}><CircleHelp size={19} /> <span>Ajuda</span></button>
        <div className="sidebar-profile">
          <div className="profile-avatar">M</div>
          <div><strong>Márcia</strong><small>Advogada</small></div>
          <ChevronDown size={16} className="profile-chevron" />
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="mobile-brand"><span className="brand-monogram">M</span><strong>Márcia</strong></div>
          <label className="workspace-search">
            <Search size={18} aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value) setSection("Processos"); }} placeholder="Buscar processo, cliente ou tarefa" aria-label="Buscar processo, cliente ou tarefa" />
            <span className="search-shortcut"><Command size={12} /> K</span>
          </label>
          <div className="topbar-actions">
            <span className="sync-state"><span /> Dados de demonstração</span>
            <button className="icon-button" aria-label="Notificações de exemplo" onClick={() => { setSection("Hoje"); notify("Você está em dia com as notificações de exemplo."); }}><Bell size={19} /><i /></button>
            <button className="primary-button top-create" onClick={openQuick}><Plus size={17} /> <span>Criar</span></button>
          </div>
        </header>

        <div className="workspace-content">
          <div className="workspace-page-heading">
            <div>
              <p className="eyebrow">{dateLabel}</p>
              <h1>{section === "Hoje" ? "Bom dia, Márcia" : section}</h1>
              <p className="heading-description">{section === "Hoje" ? "Seu dia, em ordem. Veja o que merece sua atenção primeiro." : section === "Processos" ? "Encontre rapidamente os assuntos do seu escritório." : section === "Agenda" ? "Compromissos e tarefas em um só lugar." : section === "Financeiro" ? "Uma visão simples do que entra e do que sai." : "Encontre decisões e fontes jurídicas com confiança."}</p>
            </div>
            <button className="outline-button date-button" onClick={() => setSection("Agenda")}><CalendarDays size={17} /> Hoje <ChevronDown size={15} /></button>
          </div>

          {section === "Hoje" && (
            <div className="dashboard-grid">
              <section className="dashboard-primary">
                {!noticeReviewed && <article className="attention-card">
                  <div className="attention-icon"><Bell size={19} /></div>
                  <div className="attention-copy">
                    <div className="attention-kicker">PRECISA DA SUA CONFERÊNCIA <span>· EXEMPLO</span></div>
                    <h2>Uma publicação para revisar</h2>
                    <p>Processo cível · Cliente de exemplo</p>
                    <div className="source-row"><Clock3 size={14} /> Recebida hoje às 08:42 <span>•</span> Fonte simulada</div>
                  </div>
                  <button className="attention-action" onClick={() => setDialog("notice")} aria-label="Abrir revisão da publicação de exemplo"><ArrowRight size={19} /></button>
                </article>}
                {noticeReviewed && <article className="reviewed-banner"><span className="review-check"><Check size={16} /></span><div><strong>Revisão do exemplo concluída</strong><p>Nenhum tribunal foi consultado. Este estado existe só nesta demonstração.</p></div></article>}

                <section className="surface-card today-card">
                  <div className="section-heading"><div><h2>O que vem a seguir</h2><p>Três itens para organizar seu dia</p></div><button className="text-button" onClick={() => setSection("Agenda")}>Ver agenda <ArrowRight size={15} /></button></div>
                  <div className="task-list">
                    {tasks.map((task) => <div className={`task-row ${task.done ? "task-done" : ""}`} key={task.id}>
                      <button className={`task-check ${task.done ? "checked" : ""}`} onClick={() => toggleTask(task.id)} aria-label={task.done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}>{task.done && <Check size={13} />}</button>
                      <div className="task-copy"><strong>{task.title}</strong><span>{task.matter}</span></div>
                      <time>{task.time}</time>
                    </div>)}
                  </div>
                  <button className="add-inline" onClick={() => setDialog("Tarefa")}><Plus size={16} /> Adicionar uma tarefa</button>
                </section>

                <section className="surface-card movement-card">
                  <div className="section-heading"><div><h2>Atualizações recentes</h2><p>O que mudou nos seus assuntos</p></div><button className="icon-quiet" aria-label="Filtrar atualizações" onClick={() => notify("Filtro de demonstração selecionado.")}><Filter size={17} /></button></div>
                  <div className="movement-row"><span className="movement-icon movement-burgundy"><FileText size={17} /></span><div><strong>Documento organizado</strong><span>Família · Cliente de exemplo</span></div><small>Ontem</small></div>
                  <div className="movement-row"><span className="movement-icon movement-green"><Check size={17} /></span><div><strong>Tarefa concluída</strong><span>Cível · Cliente de exemplo</span></div><small>12 nov</small></div>
                  <button className="text-button movement-link" onClick={() => setSection("Processos")}>Ver processos <ArrowRight size={15} /></button>
                </section>
              </section>

              <aside className="dashboard-secondary">
                <section className="surface-card agenda-card">
                  <div className="section-heading"><div><h2>Na sua agenda</h2><p>Hoje · {dateLabel}</p></div><span className="calendar-mini"><CalendarDays size={18} /></span></div>
                  <div className="agenda-event"><span className="agenda-line" /><time>10:30</time><div><strong>Reunião com cliente</strong><span>Remota · Cliente de exemplo</span></div></div>
                  <div className="agenda-event"><span className="agenda-line agenda-line-gold" /><time>14:00</time><div><strong>Revisar contrato</strong><span>Escritório · 30 min</span></div></div>
                  <button className="agenda-more" onClick={() => setSection("Agenda")}>Abrir agenda completa <ArrowRight size={15} /></button>
                </section>

                <section className="finance-peek">
                  <div className="finance-peek-top"><span>RESUMO FINANCEIRO</span><Wallet size={17} /></div>
                  <div className="finance-total">{brl(entries.filter((entry) => entry.kind === "receita" && entry.state === "A receber").reduce((sum, entry) => sum + entry.value, 0))}</div>
                  <p>para receber · valores de exemplo</p>
                  <div className="finance-footer"><span><ArrowDownLeft size={15} /> {entries.filter((entry) => entry.kind === "receita" && entry.state === "Recebido").length} recebido</span><button onClick={() => setSection("Financeiro")}>Ver financeiro <ArrowRight size={14} /></button></div>
                </section>

                <button className="assistant-card" onClick={() => setSection("Pesquisa")}>
                  <span className="assistant-icon"><Sparkles size={18} /></span><span className="assistant-text"><strong>Pesquise com contexto</strong><small>Encontre jurisprudência e confira a fonte.</small></span><ArrowRight size={17} />
                </button>
              </aside>
            </div>
          )}

          {section === "Processos" && <section className="surface-card list-page-card">
            <div className="section-heading list-heading"><div><h2>Seus assuntos</h2><p>Exemplos ilustrativos, sem consulta a tribunais.</p></div><button className="outline-button" onClick={() => setDialog("Processo")}><Plus size={16} /> Novo assunto</button></div>
            <div className="matter-list">{filteredMatters.map((matter, index) => <button className="matter-row" key={matter.type} onClick={() => notify("A ficha completa será construída na próxima etapa.")}><span className={`matter-icon matter-icon-${index}`}><FolderOpen size={18} /></span><span className="matter-title"><strong>{matter.type}</strong><small>{matter.name}</small></span><span className="matter-court">{matter.court}</span><span className={`matter-status status-${index}`}>{matter.status}</span><ArrowRight size={17} className="matter-arrow" /></button>)}
              {filteredMatters.length === 0 && <div className="empty-state"><Search size={24} /><strong>Nenhum assunto encontrado</strong><span>Tente buscar por outra palavra.</span></div>}
            </div>
          </section>}

          {section === "Agenda" && <div className="agenda-page-grid"><section className="surface-card list-page-card"><div className="section-heading"><div><h2>Segunda-feira</h2><p>Seus próximos compromissos de exemplo</p></div><button className="outline-button" onClick={() => setDialog("Tarefa")}><Plus size={16} /> Novo compromisso</button></div>
            {[{ time: "10:30", title: "Reunião com cliente", detail: "Remota · Cliente de exemplo", kind: "event" }, { time: "12:00", title: "Pausa para almoço", detail: "Horário reservado", kind: "break" }, { time: "14:00", title: "Revisar contrato", detail: "Escritório · 30 minutos", kind: "task" }, { time: "16:30", title: "Organizar documentos", detail: "Cliente de exemplo · tarefa", kind: "task" }].map((item) => <div className="agenda-page-row" key={item.time}><time>{item.time}</time><span className={`agenda-page-dot ${item.kind}`} /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
          </section><section className="surface-card agenda-note"><CalendarDays size={21} /><h3>Um dia de cada vez</h3><p>Compromissos, tarefas e lembretes aparecem juntos para você encontrar o próximo passo sem trocar de tela.</p><button className="text-button" onClick={() => setSection("Hoje")}>Voltar para Hoje <ArrowRight size={15} /></button></section></div>}

          {section === "Financeiro" && <section className="finance-page">
            <div className="finance-summary-grid"><div className="summary-tile"><span>PARA RECEBER</span><strong>{brl(entries.filter((entry) => entry.kind === "receita" && entry.state === "A receber").reduce((sum, entry) => sum + entry.value, 0))}</strong><small><ArrowDownLeft size={14} /> Honorários previstos</small></div><div className="summary-tile"><span>RECEBIDO NO MÊS</span><strong>{brl(entries.filter((entry) => entry.kind === "receita" && entry.state === "Recebido").reduce((sum, entry) => sum + entry.value, 0))}</strong><small><Check size={14} /> Entradas registradas</small></div><div className="summary-tile"><span>DESPESAS REGISTRADAS</span><strong>{brl(entries.filter((entry) => entry.kind === "despesa").reduce((sum, entry) => sum + entry.value, 0))}</strong><small><ArrowUpRight size={14} /> Valores de exemplo</small></div></div>
            <section className="surface-card list-page-card"><div className="section-heading list-heading"><div><h2>Movimentações</h2><p>Controle simples, sem conciliação bancária</p></div><button className="primary-button" onClick={() => setDialog("Lançamento")}><Plus size={16} /> Novo lançamento</button></div>
              <div className="finance-entry-list">{entries.map((entry) => <div className="finance-entry" key={entry.id}><span className={`entry-icon ${entry.kind}`} >{entry.kind === "receita" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><span className="entry-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span><span className={`entry-value ${entry.kind}`}>{entry.kind === "despesa" ? "−" : "+"}{brl(entry.value)}</span><span className="entry-state">{entry.state}</span></div>)}</div>
            </section>
            <p className="finance-disclaimer">Demonstração com valores fictícios. O escopo do controle financeiro será ajustado à rotina da Márcia.</p>
          </section>}

          {section === "Pesquisa" && <section className="research-page-grid"><section className="research-welcome"><div className="research-icon"><Sparkles size={20} /></div><p className="eyebrow">PESQUISA JURÍDICA</p><h2>Comece pela sua dúvida.</h2><p>Organize a questão e encontre caminhos para pesquisar em fontes confiáveis. As respostas futuras mostrarão de onde veio cada informação.</p><div className="research-search"><Search size={18} /><input placeholder="Ex.: quais decisões tratam de…" aria-label="Descreva sua pesquisa de jurisprudência" /><button onClick={() => notify("A busca jurídica ainda não está conectada. Esta tela apresenta o fluxo planejado.")} aria-label="Iniciar pesquisa"><ArrowRight size={18} /></button></div><small className="research-footnote">A pesquisa ainda não consulta jurisprudência. Não há resultado jurídico gerado nesta demonstração.</small></section>
            <section className="surface-card research-tips"><h3>O que uma boa pesquisa mostra</h3><div><span>01</span><p><strong>A fonte original</strong><small>Tribunal, decisão e link para conferência.</small></p></div><div><span>02</span><p><strong>O que apoia e o que diverge</strong><small>Contexto para avaliar a decisão no seu caso.</small></p></div><div><span>03</span><p><strong>Limites bem explicados</strong><small>Data da consulta e o que ainda precisa ser verificado.</small></p></div></section></section>}

          <footer className="workspace-footer"><span><span className="footer-status" /> Exemplo interativo · alterações ficam apenas nesta tela</span><button onClick={() => notify("A demonstração não envia dados para serviços externos.")}>Como funciona <ArrowRight size={14} /></button></footer>
        </div>
      </main>

      <nav className="mobile-tab-bar" aria-label="Navegação inferior">
        {navigation.slice(0, 4).map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => { setSection(label); setSearch(""); }} aria-current={section === label ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>)}
      </nav>

      {dialog && <div className="workspace-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        <section ref={modalRef} className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" aria-describedby="workspace-dialog-description">
          <button className="modal-close" onClick={() => setDialog(null)} aria-label="Fechar"><X size={19} /></button>
          {dialog === "quick" && <>
            <div className="modal-icon"><Plus size={19} /></div>
            <p className="eyebrow">O QUE VOCÊ PRECISA?</p>
            <h2 id="workspace-dialog-title">Criar algo novo</h2>
            <p className="modal-description" id="workspace-dialog-description">Escolha uma ação. É rápida e fica só nesta demonstração.</p>
            <div className="quick-actions">
              <button onClick={() => setDialog("Tarefa")}><span><Check size={18} /></span><strong>Uma tarefa</strong><ArrowRight size={16} /></button>
              <button onClick={() => setDialog("Processo")}><span><BriefcaseBusiness size={18} /></span><strong>Um assunto</strong><ArrowRight size={16} /></button>
              <button onClick={() => setDialog("Lançamento")}><span><Wallet size={18} /></span><strong>Um lançamento</strong><ArrowRight size={16} /></button>
            </div>
          </>}
          {dialog === "notice" && <>
            <div className="modal-icon notice-modal-icon"><Bell size={19} /></div>
            <p className="eyebrow">REVISÃO DE EXEMPLO</p>
            <h2 id="workspace-dialog-title">Confira antes de agir</h2>
            <p className="modal-description" id="workspace-dialog-description">Esta publicação é fictícia. Nenhum tribunal ou serviço externo foi consultado e nenhuma data processual está sendo calculada.</p>
            <div className="notice-detail">
              <span>Assunto</span><strong>Processo cível · Cliente de exemplo</strong>
              <span>Origem</span><strong>Simulação local · recebida hoje às 08:42</strong>
              <span>Próximo passo</span><strong>Conferir a comunicação no sistema oficial do tribunal</strong>
            </div>
            <button className="primary-button modal-primary" onClick={() => { setNoticeReviewed(true); setDialog(null); }}>Entendi a demonstração <Check size={16} /></button>
          </>}
          {dialog !== "quick" && dialog !== "notice" && <>
            <div className="modal-icon"><Plus size={19} /></div>
            <p className="eyebrow">{dialog === "Tarefa" ? "NOVA TAREFA" : dialog === "Lançamento" ? "NOVO LANÇAMENTO" : "NOVO ASSUNTO"}</p>
            <h2 id="workspace-dialog-title">{dialog === "Tarefa" ? "O que precisa ser feito?" : dialog === "Lançamento" ? "Registre uma movimentação" : "Adicione um assunto"}</h2>
            <p className="modal-description" id="workspace-dialog-description">Somente para demonstrar a facilidade de uso. Nada será salvo fora desta página.</p>
            <form className="workspace-form" onSubmit={createItem}>
              <label>{dialog === "Tarefa" ? "Tarefa" : dialog === "Lançamento" ? "Descrição" : "Nome do assunto"}
                <input name="title" required autoFocus placeholder={dialog === "Tarefa" ? "Ex.: enviar documentos" : dialog === "Lançamento" ? "Ex.: honorários" : "Ex.: cliente de exemplo"} />
              </label>
              {dialog === "Lançamento" && <>
                <label>Valor (R$)<input name="amount" inputMode="decimal" type="number" min="0.01" step="0.01" required placeholder="0,00" /></label>
                <label>Tipo<select name="kind"><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label>
              </>}
              <div className="modal-form-actions">
                <button type="button" className="outline-button" onClick={() => setDialog(null)}>Cancelar</button>
                <button type="submit" className="primary-button">Adicionar <ArrowRight size={16} /></button>
              </div>
            </form>
          </>}
        </section>
      </div>}
      {toast && <div className="workspace-toast" role="status"><Check size={17} /> {toast}</div>}
      <button className="mobile-create" onClick={openQuick} aria-label="Criar novo item"><Plus size={24} /></button>
    </div>
  );
};

export default Workspace;
