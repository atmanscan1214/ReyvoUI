import { Link } from 'react-router-dom'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import {
  ArrowRight,
  Building,
  Chart,
  Check,
  Clock,
  Inbox,
  Lock,
  Mail,
  MailCheck,
  Pause,
  Send,
  Shield,
  Sparkles,
  Users,
} from '../../components/icons'
import { usePageTitle } from '../../lib/usePageTitle'
import './home.css'

const FEATURES = [
  {
    icon: Mail,
    title: 'Send from your own mailbox',
    body: 'Connect Gmail or Microsoft 365 and send as yourself. No shared IPs, no borrowed identity, no ESP in the middle.',
  },
  {
    icon: Shield,
    title: 'Safe by default',
    body: 'Conservative per-inbox caps, warm-up guidance, suppression checks, and a one-click pause for every campaign.',
  },
  {
    icon: Sparkles,
    title: 'AI with a human in the loop',
    body: 'Draft and personalize in seconds. Every word is reviewed and approved before a single message leaves the building.',
  },
  {
    icon: Inbox,
    title: 'A unified reply inbox',
    body: 'Classify replies, surface the interested ones, and hand the warm context to the recruiter or account manager who owns it.',
  },
  {
    icon: Chart,
    title: 'Honest reporting',
    body: 'Sent, replies, bounces and meetings — clearly labelled, with no pretend “opened” stats or vanity delivery claims.',
  },
  {
    icon: Users,
    title: 'Built for a team',
    body: 'Owners, admins and members each see the right slice of the workspace, with an audit trail behind sensitive actions.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Import your market',
    body: 'Bring in employers by CSV or add them manually. Reyvo checks for duplicates, role-based addresses and suppressions as you go.',
  },
  {
    number: '02',
    title: 'Connect your mailbox',
    body: 'Sign in with Google Workspace or Microsoft 365. We never ask for a password and never store credentials in plain text.',
  },
  {
    number: '03',
    title: 'Build and approve',
    body: 'Write a multi-step sequence, let AI tighten the copy, then preview every variation before anyone presses send.',
  },
  {
    number: '04',
    title: 'Reply into pipeline',
    body: 'Positive replies become opportunities and tasks. The whole team sees who is interested, who followed up, and what happens next.',
  },
]

const PERSONAS = [
  {
    role: 'Agency owner',
    title: 'Grow pipeline without hiring a sales-ops team.',
    body: 'See replies, positive rate and meetings in one view — and protect the domain reputation your business runs on.',
  },
  {
    role: 'Business development',
    title: 'Spend the day in conversations, not copy-paste.',
    body: 'Personalized first lines, disciplined follow-up, and a clean list of who actually replied.',
  },
  {
    role: 'Recruiter / account manager',
    title: 'Pick up the conversation with full context.',
    body: 'Interested employers arrive with the thread, the contact and the campaign attached. No more forwarded screenshots.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    price: 299,
    description: 'For a founder-led agency making outbound a habit.',
    features: ['2 seats', '1 connected inbox', '2,500 contacts', '5,000 emails / month', '500 AI generations'],
  },
  {
    name: 'Growth',
    price: 499,
    description: 'For a small team ready to run real volume safely.',
    features: ['5 seats', '3 connected inboxes', '10,000 contacts', '20,000 emails / month', '2,000 AI generations'],
    popular: true,
  },
  {
    name: 'Scale',
    price: 999,
    description: 'For agencies with a dedicated growth function.',
    features: ['10 seats', '10 connected inboxes', '50,000 contacts', '75,000 emails / month', '7,500 AI generations'],
  },
]

const FAQS = [
  {
    question: 'Do I need a separate domain for outbound?',
    answer:
      'No. Reyvo sends through the Google Workspace or Microsoft 365 mailbox you already use. Many agencies do set up a dedicated sending domain over time, and the platform is designed to support that as you grow.',
  },
  {
    question: 'Can Reyvo guarantee my emails land in the inbox?',
    answer:
      'No tool honestly can — inbox placement is controlled by the recipient’s provider. What Reyvo does is remove the avoidable risks: conservative caps, suppression checks, unsubscribe links, and hard stops when something looks wrong.',
  },
  {
    question: 'How does the AI actually work?',
    answer:
      'AI helps draft and personalize campaign copy. It does not send anything on its own. At launch, a human approves every campaign and every variation before it goes out.',
  },
  {
    question: 'Is my agency’s data separate from other agencies?',
    answer:
      'Yes. Every tenant-scoped record is filtered by your workspace at the service layer, credentials are encrypted, and the production database enforces row-level security as a second line of defence.',
  },
  {
    question: 'What happens when someone replies or unsubscribes?',
    answer:
      'Replies are detected, classified and surfaced in a shared inbox. Unsubscribes and hard bounces are added to your suppression list immediately, and follow-ups stop for that contact automatically.',
  },
  {
    question: 'What is included in the free trial?',
    answer:
      'Fourteen days of access to the full Growth workspace with no credit card. You can connect a mailbox, import contacts and launch a campaign before deciding on a plan.',
  },
]

function DashboardMock() {
  return (
    <div className="dash" aria-hidden="true">
      <div className="dash__chrome">
        <span className="dash__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="dash__url">app.reyvo.com/overview</span>
      </div>

      <div className="dash__body">
        <aside className="dash__rail">
          <span className="dash__rail-mark">R</span>
          <span className="dash__rail-item is-active">
            <Chart size={15} />
          </span>
          <span className="dash__rail-item">
            <Send size={15} />
          </span>
          <span className="dash__rail-item">
            <Inbox size={15} />
          </span>
          <span className="dash__rail-item">
            <Users size={15} />
          </span>
          <span className="dash__avatar">DK</span>
        </aside>

        <div className="dash__main">
          <div className="dash__top">
            <div>
              <p className="dash__greeting">Good morning, Dana</p>
              <h3 className="dash__title">Pipeline overview</h3>
            </div>
            <span className="dash__action">New campaign</span>
          </div>

          <div className="dash__stats">
            <div className="dash__stat">
              <span>Replies this week</span>
              <strong>38</strong>
              <em className="is-up">+12%</em>
            </div>
            <div className="dash__stat">
              <span>Positive replies</span>
              <strong>11</strong>
              <em className="is-up">+3</em>
            </div>
            <div className="dash__stat">
              <span>Meetings booked</span>
              <strong>6</strong>
              <em>this month</em>
            </div>
          </div>

          <div className="dash__panel">
            <div className="dash__panel-head">
              <span>Active campaigns</span>
              <span>Last 7 days</span>
            </div>

            <div className="dash__row">
              <span className="dash__company dash__company--a">F</span>
              <div className="dash__campaign">
                <strong>Fintech hiring — Q1</strong>
                <span>248 contacts · 3 steps</span>
              </div>
              <div className="dash__progress">
                <span style={{ width: '68%' }} />
              </div>
              <span className="pill pill--lime">Sending</span>
            </div>

            <div className="dash__row">
              <span className="dash__company dash__company--b">H</span>
              <div className="dash__campaign">
                <strong>Healthcare — West Coast</strong>
                <span>112 contacts · 4 steps</span>
              </div>
              <div className="dash__progress">
                <span style={{ width: '42%' }} />
              </div>
              <span className="pill">Paused</span>
            </div>

            <div className="dash__row">
              <span className="dash__company dash__company--c">L</span>
              <div className="dash__campaign">
                <strong>Logistics — Midwest</strong>
                <span>386 contacts · 3 steps</span>
              </div>
              <div className="dash__progress">
                <span style={{ width: '91%' }} />
              </div>
              <span className="pill pill--lime">Sending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="hero__badge">
            <span className="hero__badge-dot" aria-hidden="true" />
            Outbound, built for staffing agencies
          </p>

          <h1 className="hero__title">
            Win employer clients without living in <em>your inbox.</em>
          </h1>

          <p className="hero__lead">
            Reyvo runs compliant outbound from your own mailbox, keeps follow-up on schedule, and
            turns the replies that matter into pipeline — with AI that never sends without your
            approval.
          </p>

          <div className="hero__actions">
            <Link to="/register" className="btn btn--primary">
              Start your free trial
              <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="btn btn--ghost">
              See how it works
            </a>
          </div>

          <ul className="hero__checks">
            <li>
              <Check size={15} /> 14 days free
            </li>
            <li>
              <Check size={15} /> No credit card
            </li>
            <li>
              <Check size={15} /> Live in under 30 minutes
            </li>
          </ul>
        </div>

        <div className="hero__visual">
          <DashboardMock />

          <div className="hero__float hero__float--reply">
            <span className="hero__float-icon">
              <MailCheck size={18} />
            </span>
            <div>
              <strong>New reply</strong>
              <span>“Happy to chat this week.”</span>
            </div>
            <span className="pill pill--lime">Interested</span>
          </div>

          <div className="hero__float hero__float--cap">
            <span className="hero__float-icon">
              <Pause size={16} />
            </span>
            <div>
              <strong>Daily cap protected</strong>
              <span>42 of 50 sent today</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container hero__strip">
        <span className="hero__strip-label">Sends through the mailboxes you already own</span>
        <ul className="hero__logos">
          <li>Google Workspace</li>
          <li>Microsoft 365</li>
          <li>Gmail</li>
          <li>Outlook</li>
          <li>Stripe</li>
        </ul>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="section problem">
      <div className="container">
        <div className="section__head section__head--split">
          <div>
            <p className="eyebrow">Why Reyvo</p>
            <h2 className="section__title">
              Your team is great at relationships. Everything around them is <em>manual.</em>
            </h2>
          </div>
          <p className="section__intro">
            Staffing runs on trust and timing. The tools around it run on spreadsheets, memory and
            hope. Reyvo closes that gap without changing how your agency sells.
          </p>
        </div>

        <div className="problem__grid">
          <article className="problem__card">
            <span className="problem__number">01</span>
            <h3>The list lives everywhere</h3>
            <p>
              Contacts sit in spreadsheets, notes and three different inboxes. Nobody is quite sure
              who was contacted — or when.
            </p>
          </article>

          <article className="problem__card">
            <span className="problem__number">02</span>
            <h3>Follow-up slips</h3>
            <p>
              A reply lands on Friday afternoon. By Monday the thread is cold, and the warmest lead
              of the week has quietly gone.
            </p>
          </article>

          <article className="problem__card">
            <span className="problem__number">03</span>
            <h3>Sending gets risky</h3>
            <p>
              One enthusiastic day of volume can put your domain at risk — and your client’s trust
              with it.
            </p>
          </article>
        </div>

        <div className="problem__band">
          <p>
            One workspace for the work <em>around</em> the relationship.
          </p>
          <Link to="/register" className="problem__band-link">
            Start free <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="product" className="section features">
      <div className="container">
        <div className="section__head section__head--center">
          <p className="eyebrow">Inside the platform</p>
          <h2 className="section__title">
            Everything around the outreach, <em>in one place.</em>
          </h2>
          <p className="section__intro">
            Import, connect, write, send and follow up — without stitching five tools together or
            handing your reputation to a shared sending pool.
          </p>
        </div>

        <div className="features__grid">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article className="feature" key={title}>
              <span className="feature__icon">
                <Icon size={21} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <div className="personas">
          {PERSONAS.map((persona) => (
            <article className="persona" key={persona.role}>
              <p className="persona__role">{persona.role}</p>
              <h3>{persona.title}</h3>
              <p>{persona.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="section how">
      <div className="container">
        <div className="section__head section__head--split">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="section__title">
              Empty workspace to first send in <em>four steps.</em>
            </h2>
          </div>
          <p className="section__intro">
            The setup is deliberately boring. The part that matters — the conversation — is where
            your team spends its time.
          </p>
        </div>

        <ol className="how__steps">
          {STEPS.map((step) => (
            <li className="how__step" key={step.number}>
              <span className="how__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Security() {
  return (
    <section id="security" className="section security">
      <div className="container security__inner">
        <div className="security__copy">
          <p className="eyebrow">Trust, engineered in</p>
          <h2 className="section__title">
            Tenant isolation isn’t a setting. It’s the <em>architecture.</em>
          </h2>
          <p className="section__intro">
            Your contacts, campaigns and mailbox credentials belong to your agency. Every request is
            scoped to your workspace, and sensitive actions leave an audit trail.
          </p>

          <ul className="security__list">
            <li>
              <span className="security__list-icon">
                <Lock size={17} />
              </span>
              <div>
                <strong>Scoped at the service layer</strong>
                <p>Tenant filters are applied server-side, never taken from a request parameter.</p>
              </div>
            </li>
            <li>
              <span className="security__list-icon">
                <Shield size={17} />
              </span>
              <div>
                <strong>Encrypted mailbox tokens</strong>
                <p>OAuth credentials are encrypted at rest and never written to logs or analytics.</p>
              </div>
            </li>
            <li>
              <span className="security__list-icon">
                <Clock size={17} />
              </span>
              <div>
                <strong>Compliance before the first send</strong>
                <p>Suppression checks, unsubscribe links and a physical mailing address are built in.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="security__panel">
          <div className="security__panel-head">
            <span className="security__panel-dot" aria-hidden="true" />
            Workspace controls
          </div>
          <ul>
            <li>
              <Check size={15} /> Workspace-level tenant isolation
            </li>
            <li>
              <Check size={15} /> Least-privilege OAuth scopes
            </li>
            <li>
              <Check size={15} /> One-click campaign pause
            </li>
            <li>
              <Check size={15} /> Per-inbox daily sending caps
            </li>
            <li>
              <Check size={15} /> Suppression &amp; unsubscribe handling
            </li>
            <li>
              <Check size={15} /> Role-based access for owners and members
            </li>
            <li>
              <Check size={15} /> Audit trail for sensitive actions
            </li>
          </ul>
          <div className="security__panel-foot">
            <Building size={16} />
            <span>Built for agencies, not enterprise sales floors.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="section pricing">
      <div className="container">
        <div className="section__head section__head--center">
          <p className="eyebrow">Pricing</p>
          <h2 className="section__title">
            One flat plan. No surprise <em>per-send</em> fees.
          </h2>
          <p className="section__intro">
            Every plan includes a 14-day free trial. Annual prepay gets two months free. Prices in
            USD.
          </p>
        </div>

        <div className="pricing__grid">
          {PLANS.map((plan) => (
            <article
              className={`plan ${plan.popular ? 'plan--popular' : ''}`}
              key={plan.name}
              aria-label={`${plan.name} plan`}
            >
              {plan.popular ? <span className="plan__badge">Most popular</span> : null}
              <h3 className="plan__name">{plan.name}</h3>
              <p className="plan__description">{plan.description}</p>
              <p className="plan__price">
                <span className="plan__currency">$</span>
                {plan.price}
                <span className="plan__period">/month</span>
              </p>
              <Link
                to="/register"
                className={`btn btn--block ${plan.popular ? 'btn--lime' : 'btn--ghost'}`}
              >
                Start free trial
              </Link>
              <ul className="plan__features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={15} /> {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="pricing__note">
          Need something bigger, or an invoice with your agency’s details?{' '}
          <a href="mailto:hello@reyvo.com?subject=Reyvo%20plans">Talk to us</a>.
        </p>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section className="section faq">
      <div className="container faq__inner">
        <div className="faq__head">
          <p className="eyebrow">Questions</p>
          <h2 className="section__title">
            The honest <em>answers.</em>
          </h2>
          <p className="section__intro">
            Still curious? Email{' '}
            <a href="mailto:hello@reyvo.com">hello@reyvo.com</a> and a human will get back to you.
          </p>
        </div>

        <div className="faq__list">
          {FAQS.map((item, index) => (
            <details className="faq__item" key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <span className="faq__icon" aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="cta">
      <div className="container">
        <div className="cta__panel">
          <div className="cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>
              Turn the next prospect into your next <em>client.</em>
            </h2>
            <p>
              Set up your workspace, connect a mailbox, and send your first compliant campaign in
              under 30 minutes.
            </p>
          </div>
          <div className="cta__actions">
            <Link to="/register" className="btn btn--primary">
              Create your workspace
              <ArrowRight size={18} />
            </Link>
            <a href="mailto:hello@reyvo.com?subject=Reyvo%20demo" className="btn cta__btn-ghost">
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  usePageTitle()

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Problem />
        <Features />
        <HowItWorks />
        <Security />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
