import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";

/*
  Barlow es la tipografía de la marca y la única de la aplicación.

  Se carga con next/font y no con un <link> a Google Fonts: next/font descarga
  el archivo en el build y lo sirve desde el mismo dominio, así que no hay una
  petición a un tercero en cada carga ni un salto de tipografía mientras llega.
  En una bodega con señal mala, ese salto es medio segundo de texto bailando.

  Se piden solo los tres pesos que la interfaz usa. Cada peso extra es un
  archivo más que descargar para nada.
*/
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--fuente-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Inventario",
  description:
    "Control de inventario: una foto identifica el producto, le asigna SKU y propone descripción y precio para que una persona los confirme.",
  /*
    Sin indexar. Es una aplicación interna y sus URL no tienen por qué estar en
    un buscador.
  */
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  /*
    Color de la barra del navegador en móvil. Va el NEGRO de la marca, que es
    el mismo del encabezado de la aplicación: así la barra del sistema y la de
    la aplicación se leen como una sola pieza. Quedó en azul al repintar a la
    paleta de Pánico Ideas, y era un color que ya no existe en la interfaz.
  */
  themeColor: "#0a0a0a",
};

/*
  El tipo va explícito y no con LayoutProps<"/">, que Next genera en .next/types
  durante el build: con el tipo generado, un typecheck en limpio falla antes de
  haber compilado nunca, y eso rompe cualquier verificación en CI.
*/
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${barlow.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
