import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function NotFound() {
  return (
    <main className="container standalone">
      <BrandMark size={36} />
      <Eyebrow>404 · Not found</Eyebrow>
      <h1 className="display">This page stayed private.</h1>
      <p className="lede">The address you followed does not exist. Head back to the Sherwood home page.</p>
      <div>
        <Button magnetic variant="solid" href="/" icon={<ArrowUpRight size={16} weight="bold" />} iconDir="upright">
          Back home
        </Button>
      </div>
    </main>
  );
}
