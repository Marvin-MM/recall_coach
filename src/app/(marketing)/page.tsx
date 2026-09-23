import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { BeforeAfter, WhatItRemembers } from "@/components/marketing/sections";
import { Trust } from "@/components/marketing/trust";
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
