import { notFound } from "next/navigation";
import { WhatsAppLinkForm } from "./WhatsAppLinkForm";

export const dynamic = "force-dynamic";

export default async function WhatsAppLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ registrationId?: string }>;
}) {
  const { registrationId } = await searchParams;
  if (!registrationId || registrationId.length > 100) notFound();

  return (
    <main className="min-h-screen bg-[#f8f6f2] px-4 py-24">
      <div className="mx-auto flex max-w-5xl justify-center">
        <WhatsAppLinkForm registrationId={registrationId} />
      </div>
    </main>
  );
}
