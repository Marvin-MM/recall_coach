import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/trust-faq-footer";
import { CoachWidget } from "@/components/widget/coach-widget";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteNav />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
      <CoachWidget variant="floating" />
    </>
  );
}
