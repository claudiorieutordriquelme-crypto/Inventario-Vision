import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { credencialesDemo } from "@/lib/datos/demo";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = {
  title: "Entrar · Inventario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const [{ volver }, demo] = await Promise.all([searchParams, credencialesDemo()]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-primario hover:underline">
        Volver
      </Link>

      <div className="mt-6 inline-flex w-fit items-center rounded-xl bg-negro p-3">
        <Logo className="size-16" />
      </div>

      <p className="mt-6 text-xs font-bold tracking-widest text-primario uppercase">Inventario</p>
      <h1 className="mt-1 text-2xl font-bold text-gris-900">Entrar</h1>
      <p className="mt-2 text-base text-gris-600">
        Con la cuenta que te asignaron. Si no tienes una, pídesela a quien
        administra el sistema.
      </p>

      <FormularioLogin volver={volver ?? ""} demo={demo} />
    </main>
  );
}
