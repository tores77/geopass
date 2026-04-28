import React, { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { UserPlus, Search, Coins } from "lucide-react";
import NivelBadge from "../components/NivelBadge";
import AddSocioModal from "../components/AddSocioModal";
import AddPointsModal from "../components/AddPointsModal";

const PAGE_SIZE = 20;

export default function Socios() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nivelFilter, setNivelFilter] = useState("todos");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [pointsFor, setPointsFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/socios");
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let arr = [...items];
    const term = search.trim().toLowerCase();
    if (term) {
      arr = arr.filter(
        (s) =>
          (s.nombre || "").toLowerCase().includes(term) ||
          (s.email || "").toLowerCase().includes(term),
      );
    }
    if (nivelFilter !== "todos") {
      arr = arr.filter((s) => (s.nivel || "basico") === nivelFilter);
    }
    arr.sort((a, b) => {
      switch (sort) {
        case "puntos_desc":
          return (b.puntos || 0) - (a.puntos || 0);
        case "puntos_asc":
          return (a.puntos || 0) - (b.puntos || 0);
        case "created_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });
    return arr;
  }, [items, search, nivelFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, nivelFilter, sort]);

  return (
    <Layout
      title="Socios"
      action={
        <button
          onClick={() => setOpenCreate(true)}
          className="gp-btn-primary inline-flex items-center gap-1.5"
          data-testid="socios-new-btn"
        >
          <UserPlus size={16} /> Nuevo socio
        </button>
      }
    >
      <div className="gp-card p-5">
        <div className="flex flex-col md:flex-row gap-3 md:items-center mb-5">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gp-muted)]"
            />
            <input
              type="search"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="gp-input pl-9"
              data-testid="socios-search"
            />
          </div>
          <select
            value={nivelFilter}
            onChange={(e) => setNivelFilter(e.target.value)}
            className="gp-input md:max-w-[180px]"
            data-testid="socios-nivel-filter"
          >
            <option value="todos">Todos los niveles</option>
            <option value="basico">Básico</option>
            <option value="bronce">Bronce</option>
            <option value="plata">Plata</option>
            <option value="oro">Oro</option>
            <option value="vip">VIP</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="gp-input md:max-w-[200px]"
            data-testid="socios-sort"
          >
            <option value="created_desc">Alta · más reciente</option>
            <option value="created_asc">Alta · más antigua</option>
            <option value="puntos_desc">Puntos · mayor a menor</option>
            <option value="puntos_asc">Puntos · menor a mayor</option>
          </select>
        </div>

        {loading ? (
          <div className="text-sm text-[var(--gp-muted)] py-10 text-center">Cargando…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-[var(--gp-muted)] py-14 text-center">
            {items.length === 0
              ? "Aún no tienes socios registrados. Comparte tu QR para empezar."
              : "No hay socios que coincidan con los filtros."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gp-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Puntos</th>
                  <th>Nivel</th>
                  <th>Alta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} data-testid={`socio-row-${s.id}`}>
                    <td className="font-medium">{s.nombre}</td>
                    <td className="text-[var(--gp-muted)]">{s.email}</td>
                    <td className="text-[var(--gp-muted)]">{s.telefono || "—"}</td>
                    <td>{s.puntos}</td>
                    <td><NivelBadge nivel={s.nivel} /></td>
                    <td className="text-xs text-[var(--gp-muted)]">
                      {new Date(s.created_at).toLocaleDateString("es-ES")}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/socios/${s.id}`}
                          className="text-xs text-[var(--gp-primary)] hover:underline"
                          data-testid={`socio-view-${s.id}`}
                        >
                          Ver detalle
                        </Link>
                        <button
                          onClick={() => setPointsFor(s)}
                          className="text-xs text-[var(--gp-secondary)] hover:underline inline-flex items-center gap-1"
                          data-testid={`socio-points-${s.id}`}
                        >
                          <Coins size={12} /> Sumar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-5 text-xs text-[var(--gp-muted)]">
            <span>
              Página {page} de {totalPages} · {filtered.length} socios
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-full border border-[var(--gp-border)] disabled:opacity-40 hover:border-[var(--gp-primary)]"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-full border border-[var(--gp-border)] disabled:opacity-40 hover:border-[var(--gp-primary)]"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      <AddSocioModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={load}
      />
      <AddPointsModal
        open={!!pointsFor}
        socio={pointsFor}
        onClose={() => setPointsFor(null)}
        onUpdated={load}
      />
    </Layout>
  );
}
