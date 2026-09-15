"use client";

import { useEffect } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Sherwood error boundary:", error);
  }, [error]);

  return (
    <main className="container standalone">
      <BrandMark size={36} />
      <Eyebrow>Unexpected error</Eyebrow>
      <h1 className="display">Something went wrong.</h1>
      <p className="lede">We hit an error while loading the application. Your persisted runtime state is untouched.</p>
      <div>
        <button type="button" className="btn btn--solid" onClick={() => retry()}>
          <span className="btn__surface" aria-hidden="true" />
          <span className="btn__content">Try again</span>
        </button>
      </div>
    </main>
  );
}
