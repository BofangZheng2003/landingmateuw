import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import deptDoc from "@/assets/dept-coordinator.pdf.asset.json";
import orientationDoc from "@/assets/orientation-meng.pdf.asset.json";

export const Route = createFileRoute("/information")({
  head: () => ({
    meta: [
      { title: "Resources & Downloads | PeerBridge" },
      {
        name: "description",
        content:
          "Download orientation slides and department coordinator guides for new students on PeerBridge.",
      },
      { property: "og:title", content: "Resources & Downloads | PeerBridge" },
      {
        property: "og:description",
        content: "Orientation and department guides available for download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Information,
});

const files = [
  {
    title: "MEng Orientation",
    description: "Orientation slide deck for incoming MEng students.",
    url: orientationDoc.url,
    filename: orientationDoc.original_filename,
    size: orientationDoc.size,
  },
  {
    title: "Department Coordinator Presentation",
    description: "Key contacts, procedures and department guidance.",
    url: deptDoc.url,
    filename: deptDoc.original_filename,
    size: deptDoc.size,
  },
];

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Information() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (url: string, filename: string) => {
    setBusy(filename);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="font-serif-display text-3xl md:text-4xl font-semibold tracking-tight">
          Resources
        </h1>
        <p className="mt-2 text-muted-foreground">
          Click a file to download it to your computer.
        </p>

        <div className="mt-8 space-y-4">
          {files.map((f) => (
            <Card key={f.filename} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF · {formatSize(f.size)}
                  </p>
                </div>
                <Button
                  onClick={() => download(f.url, f.filename)}
                  disabled={busy === f.filename}
                  className="shrink-0"
                >
                  <Download className="mr-2 size-4" />
                  {busy === f.filename ? "Downloading..." : "Download"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
