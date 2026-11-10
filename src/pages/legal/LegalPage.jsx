import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { usePageTitle } from '../../lib/usePageTitle'
import './legal.css'

const CONTENT = {
  terms: {
    title: 'Terms of Service',
    intro:
      'These terms explain what you can expect from Reyvo, and what we expect from you when you use it.',
    sections: [
      {
        heading: '1. Using Reyvo',
        body: [
          'Reyvo provides a workspace for staffing agencies to run compliant outbound email campaigns from mailboxes they own. You must be at least 18 years old and able to enter into a contract on behalf of your agency.',
          'You are responsible for the accuracy of the information you provide, for keeping your login credentials secure, and for the activity of everyone you invite to your workspace.',
        ],
      },
      {
        heading: '2. Your content and your contacts',
        body: [
          'You own the contacts, companies, copy and campaign data you bring into Reyvo. You grant us the limited licence we need to store, process and transmit that content so the service can work.',
          'You confirm that you have a lawful basis to contact the people you import, and that your outreach complies with the laws that apply to you and your recipients — including CAN-SPAM, GDPR, PECR and local equivalents.',
        ],
      },
      {
        heading: '3. Acceptable use',
        body: [
          'You may not use Reyvo to send purchased or scraped lists, deceptive sender information, harassment, or content that violates the rights of others. You must honour unsubscribe requests and suppression records.',
          'We may investigate reported abuse and suspend workspaces that put recipients, other customers or deliverability at risk.',
        ],
      },
      {
        heading: '4. Connected mailboxes',
        body: [
          'When you connect a Google Workspace or Microsoft 365 mailbox, you authorise us to access it through OAuth scopes you approve. We never ask for or store your mailbox password.',
          'You may only connect mailboxes you are authorised to use. Disconnecting a mailbox revokes our access, and campaigns that depend on it will pause.',
        ],
      },
      {
        heading: '5. Trials, plans and billing',
        body: [
          'New workspaces include a 14-day trial with no credit card required. Paid plans are billed monthly in advance, plus applicable taxes. Annual prepayment is available and includes two months free.',
          'Cancellation takes effect at the end of the current billing period. We do not provide refunds for partial periods, but you can export your data during any grace period.',
        ],
      },
      {
        heading: '6. Suspension and termination',
        body: [
          'We may suspend or terminate a workspace for non-payment, material breach of these terms, or suspected abuse. Where reasonable, we will give notice and time to export your data first.',
          'You may close your workspace at any time. Once closed, we delete or anonymise your data according to our retention policy and legal obligations.',
        ],
      },
      {
        heading: '7. What we do not promise',
        body: [
          'Email deliverability is controlled by recipient providers. Reyvo uses conservative defaults and safety controls, but we cannot guarantee inbox placement, reply rates, meetings or revenue.',
          'The service is provided on an “as is” basis to the extent permitted by law, and our aggregate liability is limited to the fees you paid in the twelve months before a claim.',
        ],
      },
      {
        heading: '8. Contact',
        body: [
          'Questions about these terms? Email hello@reyvo.com and we will route you to the right person.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'This policy describes the data Reyvo collects, why we need it, and the choices you have. It covers our website, the Reyvo workspace and the emails we send on your behalf.',
    sections: [
      {
        heading: '1. Who we are',
        body: [
          'Reyvo is a multi-tenant outbound platform for staffing agencies. For the account and workspace data described here, Reyvo acts as the controller. For the contact data our customers import, the customer is the controller and Reyvo acts as a processor.',
        ],
      },
      {
        heading: '2. Data we collect',
        body: [
          'Account data: your name, work email, agency name, timezone, role and authentication metadata.',
          'Workspace data: contacts, companies, lists, campaigns, message content, replies, tasks and suppression records that you or your team create.',
          'Mailbox metadata: the address and provider of connected mailboxes, granted scopes, token expiry and connection health. OAuth tokens are encrypted at rest.',
          'Usage data: requests, feature usage, sending counts and audit events needed to operate and secure the service.',
        ],
      },
      {
        heading: '3. How we use it',
        body: [
          'To provide the workspace, authenticate users, send the campaigns you approve, detect replies and bounces, enforce sending caps, prevent abuse, provide support, and meet legal and accounting obligations.',
          'We do not sell personal data, and we do not use your contact data to train third-party AI models.',
        ],
      },
      {
        heading: '4. Legal bases',
        body: [
          'Where GDPR applies, we rely on contract performance for the service, legitimate interests for security and product improvement, consent where required (for example optional product emails), and legal obligation for tax and compliance records.',
        ],
      },
      {
        heading: '5. Sharing and subprocessors',
        body: [
          'We share data with providers that help us run Reyvo: cloud hosting and storage, Google and Microsoft for mailbox access, Stripe for billing, WorkOS for enterprise SSO, and an AI provider for drafting features. Each is bound by a data processing agreement and only receives what the feature requires.',
          'We may disclose data where required by law, or in connection with a merger or acquisition with appropriate notice.',
        ],
      },
      {
        heading: '6. Retention and deletion',
        body: [
          'Workspace data is kept while your account is active. After closure, we delete or anonymise it within 30 days, except where suppression records, audit logs or financial records must be retained longer to meet legal obligations.',
          'Suppression records are retained for at least four years so that opt-outs continue to be honoured.',
        ],
      },
      {
        heading: '7. Security',
        body: [
          'We isolate tenant data at the service layer, encrypt credentials at rest, use least-privilege OAuth scopes, log sensitive actions, and enforce row-level security in production as a second line of defence. Access to customer data by Reyvo staff is limited, logged and, where appropriate, time-boxed.',
        ],
      },
      {
        heading: '8. Your rights and contact',
        body: [
          'Depending on where you live, you may have the right to access, correct, export, restrict or delete your personal data, and to object to certain processing. Workspace owners can export or delete their workspace from settings, or contact us.',
          'Email hello@reyvo.com to exercise a right or ask a privacy question. You can also complain to your local data protection authority.',
        ],
      },
    ],
  },
}

export function LegalPage({ kind }) {
  const content = CONTENT[kind] ?? CONTENT.terms
  usePageTitle(content.title)

  return (
    <div className="legal">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="legal__main">
        <div className="container">
          <header className="legal__head">
            <p className="eyebrow">Legal</p>
            <h1>{content.title}</h1>
            <p className="legal__intro">{content.intro}</p>
            <p className="legal__updated">Last updated 10 November 2026 · Applies to the Reyvo beta</p>
          </header>

          <div className="legal__layout">
            <nav className="legal__toc" aria-label="On this page">
              <p>On this page</p>
              <ul>
                {content.sections.map((section) => (
                  <li key={section.heading}>
                    <a href={`#${slug(section.heading)}`}>{section.heading.replace(/^\d+\.\s*/, '')}</a>
                  </li>
                ))}
              </ul>
              <div className="legal__contact">
                <strong>Questions?</strong>
                <a href="mailto:hello@reyvo.com">hello@reyvo.com</a>
              </div>
            </nav>

            <article className="legal__content">
              {content.sections.map((section) => (
                <section key={section.heading} id={slug(section.heading)}>
                  <h2>{section.heading}</h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
              <p className="legal__fineprint">
                This page is written for the Reyvo beta and is not legal advice. We will publish
                counsel-reviewed versions before general availability, and we will tell workspace
                owners when those terms take effect.
              </p>
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
