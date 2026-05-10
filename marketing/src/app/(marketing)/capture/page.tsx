import CaptureForm from "@/components/leads/CaptureForm";

export const metadata = {
  title: "Get started",
  description: "Join our list and we'll be in touch.",
};

export default function CapturePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md">
        <CaptureForm headline="Get early access" source="ORGANIC" />
      </div>
    </main>
  );
}
