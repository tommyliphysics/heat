import type { ReactNode } from 'react'

type PageLayoutProps = {
  /** Pinned above the scrollable area — page title, back-to-list links, etc. */
  header?: ReactNode
  /** The scrollable middle: forms, tables, lists — anything that can grow long. */
  children?: ReactNode
  /** Pinned below the scrollable area — Back/Dashboard links stay reachable no matter how long the content gets. */
  footer?: ReactNode
}

/**
 * Fixed header, fixed footer, scrollable middle — so nav links (Back,
 * Dashboard, ...) stay reachable without scrolling past a page's content,
 * however long that content gets.
 */
function PageLayout({ header, children, footer }: PageLayoutProps) {
  return (
    <section className="page page-scroll">
      {header && <div className="page-scroll-header">{header}</div>}
      <div className="page-scroll-content">
        <div className="page-scroll-content-inner">{children}</div>
      </div>
      {footer && <div className="page-scroll-footer">{footer}</div>}
    </section>
  )
}

export default PageLayout
