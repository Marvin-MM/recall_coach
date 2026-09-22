import { Hero } from "@/components/marketing/hero";
import { BeforeAfter, HowItWorks, WhatItRemembers } from "@/components/marketing/sections";
import { Faq, Trust } from "@/components/marketing/trust-faq-footer";
import { env } from "@/env";

export default function LandingPage() {
  const accountUrl = `${env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL}${env.MEMWAL_ACCOUNT_ID}`;
  return (
    <>
      <Hero />
      <HowItWorks />
      <BeforeAfter />
      <WhatItRemembers />
      <Trust accountUrl={accountUrl} />
      <Faq />
    </>
  );
}
