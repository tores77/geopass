import React from "react";
import Layout from "../components/Layout";
import { Building2 } from "lucide-react";

export default function Aliados() {
  return (
    <Layout title="Comercios aliados">
      <div className="gp-card p-12 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[rgba(14,165,233,0.12)] text-[var(--gp-secondary)] flex items-center justify-center mb-4">
          <Building2 size={26} />
        </div>
        <h3 className="text-2xl gp-display mb-2">Próximamente en Fase 2</h3>
        <p className="text-sm text-[var(--gp-muted)] max-w-md">
          La gestión de comercios aliados con geolocalización y horarios push está incluida en
          la siguiente fase de GeoPass™. Mientras tanto, sigue creciendo tu base de socios.
        </p>
      </div>
    </Layout>
  );
}
