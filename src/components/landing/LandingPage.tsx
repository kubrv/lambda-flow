import { useState, type CSSProperties } from "react";
import { PLAN_PRICE_BRL } from "../../lib/auth";
import { formatMoneyBRL } from "../../lib/labels";
import { BrandLogo } from "../BrandLogo";
import { SiteFooter } from "../SiteFooter";
import { WhatsAppFloat } from "../WhatsAppFloat";

type Props = {
  onLogin: () => void;
  onCreateCompany?: () => void;
};

type ShowcaseId = "rota" | "mapa" | "financeiro" | "endereco";

const SHOWCASES: {
  id: ShowcaseId;
  title: string;
  text: string;
}[] = [
  {
    id: "rota",
    title: "Rota do dia",
    text: "Calendário do mês, paradas ordenadas, caixas e valor estimado com o km do motoboy.",
  },
  {
    id: "mapa",
    title: "Maps & Waze",
    text: "Um toque abre a rota completa ou a navegação até a próxima parada.",
  },
  {
    id: "financeiro",
    title: "Financeiro",
    text: "Lançamento automático ao salvar a rota e relatório de → até.",
  },
  {
    id: "endereco",
    title: "Endereços",
    text: "Busca com opções, link do Maps, complemento só para o boy achar.",
  },
];

function MotoboyWheelie({ className = "" }: { className?: string }) {
  return (
    <div className={`wheelie-track ${className}`.trim()} aria-hidden>
      <div className="wheelie-smoke-trail">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="wheelie-puff"
            style={{ "--puff-i": i } as CSSProperties}
          />
        ))}
      </div>
      <div className="wheelie-rider">
        <svg viewBox="0 0 160 90" className="wheelie-svg" role="img">
          <g transform="rotate(-28 70 70)">
            <circle cx="78" cy="28" r="10" fill="#38e8ff" />
            <rect x="70" y="36" width="16" height="22" rx="6" fill="#0a2430" />
            <path d="M74 40 L55 55 L60 58 L78 46 Z" fill="#7fb4c2" />
            <rect x="48" y="52" width="58" height="10" rx="4" fill="#e8fbff" />
            <circle
              cx="58"
              cy="68"
              r="12"
              fill="#031018"
              stroke="#38e8ff"
              strokeWidth="3"
            />
            <circle cx="58" cy="68" r="4" fill="#38e8ff" />
            <circle
              cx="108"
              cy="52"
              r="14"
              fill="#031018"
              stroke="#00c2d8"
              strokeWidth="3"
            />
            <circle cx="108" cy="52" r="5" fill="#00c2d8" />
            <path
              d="M95 48 L120 30 L124 34 L100 52 Z"
              fill="#38e8ff"
              opacity="0.85"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function MockRota() {
  return (
    <div className="mock-ui">
      <div className="mock-top">
        <span>Março · 2026</span>
        <strong>Rota · Quinta</strong>
      </div>
      <div className="mock-cal">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d) => (
          <span key={d} className="mock-cal-h">
            {d}
          </span>
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className={`mock-cal-d${i === 10 ? " on" : ""}${i === 8 || i === 12 ? " soft" : ""}`}
          >
            {i + 5}
          </span>
        ))}
      </div>
      <div className="mock-stop">
        <span className="mock-n">1</span>
        <div>
          <strong>GdOdontologia</strong>
          <small>Entrega · 4 caixas · 9h–12h</small>
        </div>
      </div>
      <div className="mock-stop">
        <span className="mock-n">2</span>
        <div>
          <strong>Lab Central</strong>
          <small>Retirada · complemento: portão azul</small>
        </div>
      </div>
      <div className="mock-bar">
        <span>18,4 km</span>
        <span>R$ 36,80</span>
      </div>
    </div>
  );
}

function MockMapa() {
  return (
    <div className="mock-ui mock-map">
      <div className="mock-map-road" />
      <div className="mock-map-pin p1">P</div>
      <div className="mock-map-pin p2">1</div>
      <div className="mock-map-pin p3">2</div>
      <div className="mock-map-line" />
      <div className="mock-actions">
        <span className="mock-chip maps">Abrir no Maps</span>
        <span className="mock-chip waze">Waze · 1ª parada</span>
      </div>
    </div>
  );
}

function MockFinanceiro() {
  return (
    <div className="mock-ui">
      <div className="mock-top">
        <span>De 01/03 → Até 22/03</span>
        <strong>Relatório</strong>
      </div>
      <div className="mock-stats">
        <div>
          <small>Km</small>
          <strong>142,3</strong>
        </div>
        <div>
          <small>Pendente</small>
          <strong>R$ 284</strong>
        </div>
        <div>
          <small>Acertado</small>
          <strong>R$ 510</strong>
        </div>
      </div>
      <div className="mock-row">
        <span>João · automático</span>
        <strong>R$ 42,00</strong>
      </div>
      <div className="mock-row">
        <span>Carlos · 2,50/km</span>
        <strong>R$ 61,50</strong>
      </div>
    </div>
  );
}

function MockEndereco() {
  return (
    <div className="mock-ui">
      <div className="mock-top">
        <span>Cadastro</span>
        <strong>Endereço</strong>
      </div>
      <div className="mock-field">Av. Brasil, 1200</div>
      <div className="mock-suggest active">
        Av. Brasil, 1200 — São Paulo · pin ok
      </div>
      <div className="mock-suggest">Av. Brasil, 120 — Osasco</div>
      <div className="mock-field soft">Complemento: sala 3, 2º andar</div>
      <div className="mock-actions">
        <span className="mock-chip maps">Conferir no Maps</span>
      </div>
    </div>
  );
}

function ShowcaseVisual({ id }: { id: ShowcaseId }) {
  if (id === "rota") return <MockRota />;
  if (id === "mapa") return <MockMapa />;
  if (id === "financeiro") return <MockFinanceiro />;
  return <MockEndereco />;
}

export function LandingPage({ onLogin, onCreateCompany }: Props) {
  const [active, setActive] = useState<ShowcaseId>("rota");

  return (
    <div className="landing">
      <header className="landing-top">
        <BrandLogo height={44} />
        <div className="landing-top-actions">
          {onCreateCompany ? (
            <button type="button" className="btn" onClick={onCreateCompany}>
              Obter um plano para minha empresa
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary landing-login"
            onClick={onLogin}
          >
            Entrar
          </button>
        </div>
      </header>

      <section className="landing-hero landing-hero-split">
        <div className="landing-hero-copy">
          <img
            className="landing-hero-badge brand-mark"
            src="/badge.svg"
            alt=""
            width={72}
            height={72}
          />
          <p className="landing-kicker">Lambda-Flow</p>
          <h1>Rotas claras. Entregas no ritmo certo.</h1>
          <p className="landing-lead">
            Do calendário ao Waze: monte o dia, otimize o caminho e libere o
            motoboy com um toque.
          </p>
          <div className="landing-cta">
            <button
              type="button"
              className="btn primary route-nav-main"
              onClick={onCreateCompany || onLogin}
            >
              Obter um plano para minha empresa
            </button>
            <a className="btn" href="#demo">
              Ver em ação
            </a>
          </div>
        </div>
        <div className="landing-hero-stage">
          <MockRota />
        </div>
      </section>

      <section className="landing-section landing-demo" id="demo">
        <h2>Veja o sistema em ação</h2>
        <p className="landing-section-lead">
          Toque nas abas — cada uma mostra um pedaço real do fluxo.
        </p>

        <div className="demo-tabs" role="tablist">
          {SHOWCASES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active === s.id}
              className={`demo-tab${active === s.id ? " active" : ""}`}
              onClick={() => setActive(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="demo-stage">
          <div className="demo-visual" key={active}>
            <ShowcaseVisual id={active} />
          </div>
          <div className="demo-copy">
            <h3>{SHOWCASES.find((s) => s.id === active)?.title}</h3>
            <p>{SHOWCASES.find((s) => s.id === active)?.text}</p>
            <ul className="demo-bullets">
              {active === "rota" ? (
                <>
                  <li>Otimização automática da ordem</li>
                  <li>Entrega / retirada / caixas</li>
                  <li>Valor com R$/km do motoboy</li>
                </>
              ) : null}
              {active === "mapa" ? (
                <>
                  <li>Rota completa no Google Maps</li>
                  <li>Waze por parada</li>
                  <li>Mesmos botões no PDF</li>
                </>
              ) : null}
              {active === "financeiro" ? (
                <>
                  <li>Lançamento ao salvar a rota</li>
                  <li>Filtro de → até</li>
                  <li>PDF do período</li>
                </>
              ) : null}
              {active === "endereco" ? (
                <>
                  <li>Lista de opções no mapa</li>
                  <li>Link do Maps com pin exato</li>
                  <li>Complemento só para o boy</li>
                </>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section landing-flow" id="como">
        <h2>Do cadastro à rua</h2>
        <div className="flow-rail">
          <article className="flow-card">
            <span className="flow-num">1</span>
            <strong>Empresa no painel</strong>
            <p>Endereços, motoboys e 1º acesso com senha.</p>
            <div className="flow-mini">
              <MockEndereco />
            </div>
          </article>
          <article className="flow-card">
            <span className="flow-num">2</span>
            <strong>Rota do dia</strong>
            <p>Seleciona paradas, salva — km e valor saem sozinhos.</p>
            <div className="flow-mini">
              <MockRota />
            </div>
          </article>
          <article className="flow-card">
            <span className="flow-num">3</span>
            <strong>Boy na estrada</strong>
            <p>Ordem clara, Maps, Waze e PDF com botões.</p>
            <div className="flow-mini">
              <MockMapa />
            </div>
          </article>
        </div>
      </section>

      <section className="landing-section landing-plan-section" id="plano">
        <MotoboyWheelie className="wheelie-plan" />
        <div className="plan-layout">
          <div>
            <h2>Plano Empresa</h2>
            <p className="landing-section-lead">
              Um plano só. A empresa paga — o motoboy entra de graça no 1º
              acesso.
            </p>
            <p className="landing-plan-price">
              {formatMoneyBRL(PLAN_PRICE_BRL)}
              <small>/mês</small>
            </p>
            <div className="plan-pay-row">
              <span>PIX</span>
              <span>Cartão</span>
              <span>Boleto</span>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={onCreateCompany || onLogin}
            >
              Obter um plano para minha empresa
            </button>
          </div>
          <ul className="plan-grid">
            {[
              "Painel administrador completo",
              "Rotas do mês otimizadas",
              "Valor/km por motoboy",
              "1º acesso do motoboy",
              "Financeiro + PDF",
              "Maps, Waze e PDF clicável",
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-top">
          <BrandLogo height={36} tagline="Rotas · Maps · Waze" />
          <button type="button" className="btn" onClick={onLogin}>
            Entrar
          </button>
        </div>
        <SiteFooter asDiv />
      </footer>

      <WhatsAppFloat />
    </div>
  );
}
