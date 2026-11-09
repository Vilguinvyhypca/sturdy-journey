import Link from "next/link";

type AdminModeBannerProps = {
  mode: "manage" | "preview";
  context?: string;
  href: string;
  action: string;
};

export function AdminModeBanner({ mode, context, href, action }: AdminModeBannerProps) {
  const isManaging = mode === "manage";

  return (
    <section
      aria-label={isManaging ? "Administrator mode" : "Public preview with administrator session"}
      data-mode={mode}
      className="admin-mode-banner mx-auto mb-5 flex max-w-6xl flex-col gap-3 rounded-2xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em]">
          {isManaging ? "Admin mode · managing" : "Public preview · admin session active"}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {isManaging
            ? context ? `Managing ${context}.` : "Managing MediaSpace content."
            : context ? `Viewing ${context} as the public sees it. Management controls are hidden.` : "Viewing the public site. Management controls are hidden."}
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-current bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
      >
        {action}
      </Link>
    </section>
  );
}
